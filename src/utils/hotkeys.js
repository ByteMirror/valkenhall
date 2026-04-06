export function getNextCycledValue(values, currentValue) {
  if (!Array.isArray(values) || values.length === 0) {
    return currentValue;
  }

  const currentIndex = values.indexOf(currentValue);

  if (currentIndex === -1) {
    return values[0];
  }

  return values[(currentIndex + 1) % values.length];
}

function isSpaceKey(event) {
  return event.key === ' ' || event.code === 'Space';
}

function isArrowNavigationKey(key) {
  return key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight';
}

function isInteractiveHotkeyTarget(target) {
  return Boolean(
    target?.closest?.(
      'button, summary, a, [role="button"], [role="menu"], [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]'
    )
  );
}

function isArchivePreviewTarget(target) {
  return Boolean(target?.closest?.('[data-card-preview-trigger="archive"]'));
}

export function resolveAppHotkey({ event, state, isEditableTarget, leftPanelTabs, deckFilters }) {
  if (event.key === 'Escape' && (state.isSaveDialogOpen || state.isCloseDeckDialogOpen)) {
    return { kind: 'close-save-dialog' };
  }

  if (event.key === 'Escape' && (state.previewedDeckEntryIndex !== null || state.previewedArchiveCard !== null)) {
    return { kind: 'close-card-preview' };
  }

  if (event.key === 'Escape' && state.isDeckMenuOpen) {
    return { kind: 'close-deck-menu' };
  }

  if (event.key === 'Escape' && state.deckCardContextMenu) {
    return { kind: 'close-deck-card-context-menu' };
  }

  if (event.key === 'Escape' && state.selectedDeckEntryIndices?.length > 0) {
    return { kind: 'close-deck-card-context-menu' };
  }

  if (event.metaKey || event.ctrlKey || event.altKey) {
    return null;
  }

  const isEditable = isEditableTarget(event.target);
  const isInteractiveTarget = isEditable || isInteractiveHotkeyTarget(event.target);

  if (event.key.toLowerCase() === 'f' && !isEditable) {
    return { kind: 'focus-archive-search', preventDefault: true };
  }
  const isFocusedArchivePreviewTarget = isArchivePreviewTarget(event.target);

  if (
    isArrowNavigationKey(event.key) &&
    !isInteractiveTarget &&
    (state.previewedDeckEntryIndex !== null || state.previewedArchiveCard !== null)
  ) {
    return {
      kind: 'navigate-card-preview',
      direction: event.key,
      preventDefault: true,
    };
  }

  if (
    isSpaceKey(event) &&
    !event.shiftKey &&
    !state.isSaveDialogOpen &&
    !state.isDeckMenuOpen &&
    !state.deckCardContextMenu &&
    !isEditable &&
    (
      state.selectedDeckEntryIndices?.length > 0 ||
      state.hoveredDeckEntryIndex !== null ||
      state.previewedDeckEntryIndex !== null ||
      state.previewedArchiveCard !== null ||
      isFocusedArchivePreviewTarget
    )
  ) {
    return { kind: 'toggle-card-preview', preventDefault: true };
  }

  if (
    event.key === 'Tab' &&
    !event.shiftKey &&
    !isEditable &&
    !state.isSaveDialogOpen &&
    !state.isDeckMenuOpen &&
    !state.deckCardContextMenu
  ) {
    return {
      kind: 'cycle-deck-filter',
      deckFilterId: getNextCycledValue(deckFilters.map((filter) => filter.id), state.deckFilter),
      preventDefault: true,
    };
  }

  if (isEditable) {
    return null;
  }

  const leftPanelTabId = leftPanelTabs.find((tab) => tab.shortcut === event.key)?.id;

  if (leftPanelTabId) {
    return { kind: 'set-left-panel-tab', leftPanelTabId };
  }

  return null;
}
