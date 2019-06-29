
import { html } from 'https://unpkg.com/lit-html?module';

let css = `
.Phrases  {
  flex: 1;
  display: flex;
  flex-direction: row;
}
.StashAndHistory, .Favorites {
  flex: 1;
  overflow: auto;
  height: 100%;
  display: inline-block;
}
.PhrasesSectionLabel {
  background: #eee;
  font-weight: bold;
  line-height: 1.1;
  text-align: center;
  border: 1px solid black;
}
.PhrasesSectionLabel .collapsearrow, .PhrasesSectionLabel .expandarrow,
    .FavoritesCategoryLabel .collapsearrow, .FavoritesCategoryLabel .expandarrow {
  padding: 0 0.5em;
  line-height: 50%;
  vertical-align: -50%;
}
.PhrasesSectionLabel .collapsearrow, .FavoritesCategoryLabel .collapsearrow {
  vertical-align: 50%;
}
.PhrasesSectionLabel a, .PhrasesSectionLabel a:link, .PhrasesSectionLabel a:visited {
  text-decoration: none;
  cursor: pointer;
  color: black;
}
.Stash .PhrasesSectionLabel {
  border-right: none;
}
.Favorites {
  padding-left: 0.5em;
}
.FavoritesCategoryLabel {
  font-size: 90%;
  color: #ccc;
}
.FavoritesCategoryLabel a, .FavoritesCategoryLabel a:link, .FavoritesCategoryLabel a:visited {
  text-decoration: none;
  cursor: pointer;
  color: #ccc;
}
.PhraseRow {
  display: flex;
  padding: 0 5em;
}
.History button, .Stash button {
  text-align: left;
}
.FavoriteContainer {
  display: inline-block;
}
.Favorites button {
  display: inline-block;
  flex: 1;
  margin: 1px 0;
  align-items: center;
  border-radius: 3px;
  border: 1px solid black;
  background: none;
  font-size: 1rem;
  padding: 0.3rem 0.8em;
  color: black;
  text-align: left;
}
.Favorites button:hover, .Favorites button:focus {
  cursor: pointer;
}
.Favorites button:active {
  box-shadow: 0 -3px 10px rgba(0, 0, 0, 0.1) inset;
}
`;

/*
const expandArrowSpan = html`<span class=collapsearrow>&#x25B2;</span>`;
const collapseArrowSpan = html`<span class=expandarrow>&#x25BC;</span>`;
*/
const expandArrowSpan = html`<span class=collapsearrow>&#x2304;</span>`;
const collapseArrowSpan = html`<span class=expandarrow>&#x2303;</span>`;


export function Phrases(props) {
  let { speak, playAudio, triggerUpdate, Stash, History, Favorites,
    searchString, TextEntryRowSetText, TextEntryRowSetFocus } = props;
  let searchTokens = (typeof searchString  === 'string') ?
    searchString.toLowerCase().replace(/\s+/g, ' ').trim().split(' ') :
    [];
  let buildTitleWithCollapseExpandArrows = (obj, title) => {
    let arrow = obj.expanded ? collapseArrowSpan : expandArrowSpan;
    return html`<a href="" @click=${toggleCollapseExpand} .objToToggle=${obj}>${title}${arrow}</a>`;
  };
  let toggleCollapseExpand = e => {
    e.preventDefault();
    let obj = e.currentTarget.objToToggle;
    obj.expanded = !obj.expanded;
    triggerUpdate();  // FIXME this is update the whole world. Only need to update this section.
  };
  let onClick = e => {
    let shift = e.getModifierState("Shift");
    let control = e.getModifierState("Control");
    let meta = e.getModifierState("Meta");
    let text = e.target.phraseContent;
    let label  = e.target.phraseLabel;
    let audio = e.target.phraseAudio;
    if (!shift && (control || meta)) {
      TextEntryRowSetText(text);
      TextEntryRowSetFocus();
    } else if (!shift && !control && !meta) {
      if (audio) {
        playAudio(label, audio);
      } else {
        speak(text);
      }
    }
  };
  let filteredStash = Stash;
  if (searchTokens.length > 0) {
    filteredStash = JSON.parse(JSON.stringify(Stash));  // deep clone
    filteredStash.items = filteredStash.items.filter(phrase => {
      return searchTokens.some(token => {
        return (typeof phrase.text === 'string' && phrase.text.toLowerCase().includes(token)) ||
                (typeof phrase.label === 'string' && phrase.label.toLowerCase().includes(token));
      });
    });
  }
  let filteredHistory = History;
  if (searchTokens.length > 0) {
    filteredHistory = JSON.parse(JSON.stringify(History));  // deep clone
    filteredHistory.items = filteredHistory.items.filter(phrase => {
      return searchTokens.some(token => {
        return (typeof phrase.text === 'string' && phrase.text.toLowerCase().includes(token)) ||
                (typeof phrase.label === 'string' && phrase.label.toLowerCase().includes(token));
      });
    });
  }
  let filteredFavorites = JSON.parse(JSON.stringify(Favorites));  // deep clone
  filteredFavorites.forEach((category, index) => {
    category.categoryIndex = index;
    category.items = category.items.filter(phrase => {
      if (searchTokens.length === 0) {
        return true;
      } else {
        return searchTokens.some(token => {
          return (typeof phrase.text === 'string' && phrase.text.toLowerCase().includes(token)) ||
                  (typeof phrase.label === 'string' && phrase.label.toLowerCase().includes(token));
        });
      }
    });
  });
  filteredFavorites = filteredFavorites.filter(category => {
    return category.items.length > 0;
  });
  filteredFavorites.forEach(category => {
    let originalDataCategory = Favorites[category.categoryIndex];
    category.titleContent = buildTitleWithCollapseExpandArrows(originalDataCategory, category.label);
  });
  let StashTitle = buildTitleWithCollapseExpandArrows(Stash, "Stash");
  let HistoryTitle = buildTitleWithCollapseExpandArrows(History, "History");
  return html`
  <style>${css}</style>
  <div class=Phrases>
    <div class=StashAndHistory>
      <div class=PhrasesSectionLabel>${StashTitle}</div>
      ${filteredStash.expanded ?
        html`${filteredStash.items.map(phrase =>
          html`
            <div class=PhraseRow>
              <button @click=${onClick} .phraseContent=${phrase.text}>${phrase.label || phrase.text}</button>
            </div>
          `
        )}` : ''}
      <div class=PhrasesSectionLabel>${HistoryTitle}</div>
      ${filteredHistory.expanded ?
        html`${filteredHistory.items.map(phrase =>
          html`
            <div class=PhraseRow>
              <button @click=${onClick} .phraseContent=${phrase.text}>${phrase.label || phrase.text}</button>
            </div>
          `
        )}` : ''}
    </div>
    <div class=Favorites>
      <div class=PhrasesSectionLabel>Favorites</div>
      ${filteredFavorites.map(category => html`
        <div class=FavoritesCategoryLabel>${category.titleContent}</div>
        ${category.expanded ?
          html`${category.items.map(phrase =>
            html`
              <div class=FavoriteContainer>
                <button @click=${onClick} .phraseContent=${phrase.text} .phraseLabel=${phrase.label} .phraseAudio=${phrase.audio}>${phrase.label || phrase.text}</button>
              </div>
            `
          )}` : ''}
        </div>
      `)}
    </div>
  </div>`;
}
