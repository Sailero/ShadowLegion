#requires -Version 5.1
<#
.SYNOPSIS
Packages a verified static release with portable ZIP paths and validates every entry.
.EXAMPLE
.\scripts\package-web-release.ps1 -ReleaseDirectory .\release\shadow-legion-web-1.3.0-rc.2-TIMESTAMP
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ReleaseDirectory
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Get-StreamSha256 {
    param([System.IO.Stream]$Stream)
    $algorithm = [System.Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($algorithm.ComputeHash($Stream))).Replace('-', '').ToLowerInvariant() }
    finally { $algorithm.Dispose() }
}

function Assert-PortableRelativePath {
    param([string]$EntryPath)
    if ([string]::IsNullOrWhiteSpace($EntryPath) -or $EntryPath.Contains('\') -or $EntryPath.Contains(':') -or $EntryPath.StartsWith('/')) {
        throw "Unsafe ZIP path in manifest: $EntryPath"
    }
    foreach ($part in $EntryPath.Split('/')) {
        if ([string]::IsNullOrEmpty($part) -or $part -eq '.' -or $part -eq '..' -or $part -match '[<>"|?*\x00-\x1f]' -or $part -match '[. ]$') {
            throw "Non-portable ZIP path in manifest: $EntryPath"
        }
    }
}

$resolved = Resolve-Path -LiteralPath $ReleaseDirectory
if ($resolved.Provider.Name -ne 'FileSystem') { throw 'ReleaseDirectory must be a filesystem directory.' }
$source = Get-Item -LiteralPath $resolved.ProviderPath -Force
if (-not $source.PSIsContainer -or $null -eq $source.Parent) { throw 'Choose a release directory, not a file or drive root.' }
if (($source.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'A release directory cannot be a symbolic link or junction.' }
$sourceRoot = [IO.Path]::GetFullPath($source.FullName)
$sourcePrefix = $sourceRoot.TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
$manifestPath = Join-Path $sourceRoot 'release-manifest.json'
if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) { throw 'ReleaseDirectory must contain release-manifest.json.' }
$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ($manifest.version -isnot [string] -or $manifest.version -notmatch '^[0-9][0-9A-Za-z.+-]{0,63}$') { throw 'Manifest version is missing or invalid.' }
if ($null -eq $manifest.files -or @($manifest.files).Count -lt 1) { throw 'Manifest must list at least one release file.' }

$expected = New-Object 'System.Collections.Generic.Dictionary[string,object]' ([StringComparer]::OrdinalIgnoreCase)
foreach ($item in $manifest.files) {
    Assert-PortableRelativePath $item.path
    if ($item.path -eq 'release-manifest.json' -or $expected.ContainsKey($item.path)) { throw "Duplicate or self-referencing manifest entry: $($item.path)" }
    if ($item.sha256 -isnot [string] -or $item.sha256 -notmatch '^[0-9A-Fa-f]{64}$') { throw "Invalid SHA-256: $($item.path)" }
    if ($item.bytes -isnot [ValueType] -or $item.bytes -is [bool] -or [double]::IsNaN([double]$item.bytes) -or [double]::IsInfinity([double]$item.bytes) -or
        [double]$item.bytes -lt 0 -or [double]$item.bytes -gt [long]::MaxValue -or [Math]::Floor([double]$item.bytes) -ne [double]$item.bytes) {
        throw "Invalid byte length: $($item.path)"
    }
    $expected.Add($item.path, [pscustomobject]@{ Path = $item.path; Bytes = [long]$item.bytes; Sha256 = $item.sha256.ToLowerInvariant() })
}

# Walk one directory at a time; reject links before descending so unrelated paths
# cannot become part of the archive through a junction or symbolic link.
$directories = New-Object 'System.Collections.Generic.Stack[System.IO.DirectoryInfo]'
$directories.Push([IO.DirectoryInfo]::new($sourceRoot))
$files = New-Object 'System.Collections.Generic.List[System.IO.FileInfo]'
while ($directories.Count -gt 0) {
    foreach ($entry in $directories.Pop().GetFileSystemInfos()) {
        if (($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw "Linked release content is not allowed: $($entry.Name)" }
        if (($entry.Attributes -band [IO.FileAttributes]::Directory) -ne 0) { $directories.Push([IO.DirectoryInfo]$entry) }
        else { $files.Add([IO.FileInfo]$entry) }
    }
}
$archiveFiles = New-Object 'System.Collections.Generic.List[object]'
foreach ($file in ($files | Sort-Object FullName)) {
    $absolute = [IO.Path]::GetFullPath($file.FullName)
    if (-not $absolute.StartsWith($sourcePrefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'A release file escaped the source directory.' }
    $entryPath = $absolute.Substring($sourcePrefix.Length).Replace('\', '/')
    Assert-PortableRelativePath $entryPath
    $actualHash = (Get-FileHash -LiteralPath $absolute -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($entryPath -eq 'release-manifest.json') {
        $expected.Add($entryPath, [pscustomobject]@{ Path = $entryPath; Bytes = $file.Length; Sha256 = $actualHash })
    } elseif (-not $expected.ContainsKey($entryPath)) {
        throw "Unlisted file in release directory: $entryPath"
    } elseif ($expected[$entryPath].Bytes -ne $file.Length -or $expected[$entryPath].Sha256 -cne $actualHash) {
        throw "Source file does not match release manifest: $entryPath"
    }
    $archiveFiles.Add([pscustomobject]@{ Path = $entryPath; FullName = $absolute })
}
if ($archiveFiles.Count -ne $expected.Count) { throw 'One or more manifest files are missing from the release directory.' }

$parentDirectory = [IO.Path]::GetFullPath($source.Parent.FullName)
$archivePath = Join-Path $parentDirectory "Sunlit-Echoes-$($manifest.version)-web.zip"
if (Test-Path -LiteralPath $archivePath) { throw "Archive already exists; preserve it or choose a new release version: $archivePath" }
$temporaryPath = Join-Path $parentDirectory ('.sunlit-zip-' + [Guid]::NewGuid().ToString('N') + '.partial')
$createdTemporary = $false
try {
    $destination = [IO.File]::Open($temporaryPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    $createdTemporary = $true
    try {
        $zip = [IO.Compression.ZipArchive]::new($destination, [IO.Compression.ZipArchiveMode]::Create, $true, [Text.Encoding]::UTF8)
        try {
            foreach ($file in $archiveFiles) {
                [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $file.FullName, $file.Path, [IO.Compression.CompressionLevel]::Optimal)
            }
        } finally { $zip.Dispose() }
    } finally { $destination.Dispose() }

    $readback = [IO.Compression.ZipFile]::OpenRead($temporaryPath)
    try {
        if ($readback.Entries.Count -ne $expected.Count) { throw 'ZIP entry count does not match the verified release.' }
        $seen = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
        foreach ($entry in $readback.Entries) {
            Assert-PortableRelativePath $entry.FullName
            if (-not $seen.Add($entry.FullName) -or -not $expected.ContainsKey($entry.FullName)) { throw "Unexpected ZIP entry: $($entry.FullName)" }
            $record = $expected[$entry.FullName]
            if ($entry.Length -ne $record.Bytes) { throw "ZIP byte length mismatch: $($entry.FullName)" }
            $stream = $entry.Open()
            try { $hash = Get-StreamSha256 $stream } finally { $stream.Dispose() }
            if ($hash -cne $record.Sha256) { throw "ZIP SHA-256 mismatch: $($entry.FullName)" }
        }
    } finally { $readback.Dispose() }

    # File.Move refuses to overwrite an archive created by another process.
    [IO.File]::Move($temporaryPath, $archivePath)
    $result = Get-Item -LiteralPath $archivePath
    [pscustomobject]@{
        Version = $manifest.version
        Archive = $archivePath
        Bytes = $result.Length
        Sha256 = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash
        VerifiedManifestFiles = @($manifest.files).Count
        ZipEntries = $expected.Count
        ForwardSlashPaths = $true
    } | ConvertTo-Json
} finally {
    # Remove only the exact temporary file created by this invocation. Never
    # recursively delete a directory or touch an existing candidate/archive.
    if ($createdTemporary -and (Test-Path -LiteralPath $temporaryPath -PathType Leaf)) {
        Remove-Item -LiteralPath $temporaryPath
    }
}
