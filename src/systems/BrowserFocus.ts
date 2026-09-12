type FocusGame = { hasFocus: boolean; events: { emit(event: string): unknown } };
type FocusDocument = { hidden: boolean; hasFocus(): boolean };

/** Phaser starts with hasFocus=false; an already focused window may never emit focus. */
export function syncInitialBrowserFocus(game: FocusGame, documentState: FocusDocument): void {
  if (!game.hasFocus && !documentState.hidden && documentState.hasFocus()) game.events.emit('focus');
}
