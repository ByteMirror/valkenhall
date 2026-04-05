import CardResult from './CardResult';

export default function CardList({
  cards = [],
  addCardToChosenCards = null,
  removeCardFromChosenCards = null,
  changeCardPrintingFromChosenCards = null,
  upscaleChosenCardAtIndex = null,
  revertChosenCardAtIndex = null,
  restoreUpscaleFromCache = null,
  chosenList = false,
  addGapOnPrint = false,
  extraItems = [],
  onChosenCardContextMenu = null,
  onChosenCardSelect = null,
  selectedEntryIndices = [],
}) {
  const selectedEntryIndexSet = new Set(selectedEntryIndices);
  const renderedCards = chosenList
    ? cards.map((entry, idx) => (
        <CardResult
          key={`${entry.card.unique_id}-${entry.printing?.unique_id || 'none'}-${entry.entryIndex ?? idx}`}
          card={entry.card}
          printing={entry.printing}
          isUpscaling={Boolean(entry.isUpscaling)}
          chosenList={true}
          entryIndex={entry.entryIndex ?? idx}
          changeCardPrintingFromChosenCards={changeCardPrintingFromChosenCards}
          isSelected={selectedEntryIndexSet.has(entry.entryIndex ?? idx)}
          onChosenCardContextMenu={onChosenCardContextMenu}
          onChosenCardSelect={onChosenCardSelect}
          removeCardFromChosenCards={removeCardFromChosenCards}
          upscaleChosenCardAtIndex={upscaleChosenCardAtIndex}
          revertChosenCardAtIndex={revertChosenCardAtIndex}
          restoreUpscaleFromCache={restoreUpscaleFromCache}
        />
      ))
    : cards.map((card) => (
        <CardResult
          key={card.unique_id}
          card={card}
          chosenList={false}
          addCardToChosenCards={addCardToChosenCards}
        />
      ));

  return (
    <div
      role={chosenList ? 'listbox' : undefined}
      aria-label={chosenList ? 'Deck cards' : undefined}
      aria-multiselectable={chosenList ? 'true' : undefined}
      className={`card-grid ${addGapOnPrint ? 'card-grid--print-gap' : ''}`}
    >
      {renderedCards}
      {extraItems}
    </div>
  );
}
