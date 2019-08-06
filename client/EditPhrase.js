
import { html, render } from './lib/lit-html/lit-html.js';
import { buildSlideRightTitle } from './main.js';
import { playPhrase } from './Phrases.js';

let css = `
.EditPhraseContent {
  padding: 0.5em 1.75em 1em;
  font-size: 95%;
  display: flex;
  flex-direction: column;
  height: 100%;
  flex: 1;
}
.EditPhraseInputBlock {
  margin: 0.75em 0;
}
.EditPhraseInputBlock label {
  display: block;
  font-size: 90%;
}
.EditPhraseInputBlock textarea,.EditPhraseInputBlock input {
  width: 100%;
}
.EditPhraseInputBlock *:invalid {
  border-color: red;
  background: pink;
}
.EditPhrase .ButtonRow.EditPhraseTestButtonRow {
  padding-top: 0.75em;
  padding-bottom: 0;
}
#EditPhraseTestButton {
  padding-top: 0.2em;
  padding-bottom: 0.2em;
  background-color: #f66;
}
`;

export function EditPhrase(parentElement, params) {
  let { phrase, title, doItButtonLabel, doItCallback, cancelCallback,
    textLabelRequired, customControlsFunc, customControlsData } = params;
  phrase = phrase || {};
  let { type, text, label, url, videoId, startAt, endAt } = phrase;
  type = type || 'text';
  text = text || '';
  label = label || '';
  url = url || '';
  videoId = videoId || '';
  startAt = startAt || '';
  endAt = endAt || '';
  if (typeof textLabelRequired != 'boolean') textLabelRequired = false;
  let patternUrl = "^(http:\/\/www\.|https:\/\/www\.|http:\/\/|https:\/\/)?[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,5}(:[0-9]{1,5})?(\/.*)?$";
  let regexUrl = new RegExp(patternUrl);
  let patternVideoId = "^[A-Za-z0-9\-\._\~\:\@\$]{8,}$";
  let regexVideoId = new RegExp(patternVideoId);
  let patternSeconds = "^([0-9]*\.[0-9]+|[0-9]+)$";
  let regexSeconds = new RegExp(patternSeconds);
  let enableTest, enableDoit;
  let validateData = () => {
    enableTest = enableDoit = false;
    if (type === 'text') {
      enableTest = enableDoit = text.trim().length > 0 && (!textLabelRequired || label.trim().length > 0);
    } else if (type === 'audio') {
      enableTest = regexUrl.test(url);
      enableDoit = enableTest && label.trim().length > 0;
    } else if (type === 'youtube') {
      enableTest = regexVideoId.test(videoId) &&
        (startAt.length === 0 || regexSeconds.test(startAt)) &&
        (endAt.length === 0 || regexSeconds.test(endAt));
      if (regexSeconds.test(startAt) && regexSeconds.test(endAt)) {
        let startNum = parseFloat(startAt);
        let endNum = parseFloat(endAt);
        if (endNum <= startNum) {
          enableTest = false;
        }
      }
      enableDoit = enableTest && label.trim().length > 0;
    }
    document.getElementById('EditPhraseTestButton').disabled = !enableTest;
    document.getElementById('EditPhraseDoitButton').disabled = !enableDoit;
  };
  let onClickTab = e => {
    e.preventDefault();
    type = e.currentTarget.EditPhraseValue;
    localUpdate();
    validateData();
  };
  let onInput = e => {
    let field = e.currentTarget.editPhraseField;
    let value = e.currentTarget.value;
    if (field === 'text') text = value;
    else if (field === 'label') label = value;
    else if (field === 'url') url = value;
    else if (field === 'videoId') videoId = value;
    else if (field === 'startAt') startAt = value;
    else if (field === 'endAt') endAt = value;
    validateData();
  };
  let onClickTest = e => {
    e.preventDefault();
    let phrase = makePhrase();
    playPhrase(phrase);
  };
  let onClickDoit = e => {
    e.preventDefault();
    let phrase = makePhrase();
    doItCallback(phrase);
  };
  let onClickCancel = e => {
    e.preventDefault();
    cancelCallback();
  };
  let makePhrase = () => {
    let timestamp = new Date();
    let phrase = type === 'audio' ? { type, label, url, timestamp } :
      (type === 'youtube' ? { type, label, videoId, startAt, endAt, timestamp } :
      { type, text, label, timestamp });
    return phrase;
  };
  let buildTypeRadioButton = (id, value, label) => {
    let cls = 'TabControlRadioButton' + (type===value ? ' TabControlRadioButtonChecked' : '');
    return html`
      <span class=${cls} @click=${onClickTab} .EditPhraseValue=${value}>
        <label for=${id}>
          <input type=radio id=${id} name=EditPhraseType value=${value} ?checked=${type===value}></input
          ><span class=TabControlRadioButtonLabel>${label}</span>
        </label>
      </span>
    `;
  };
  let localUpdate = () => {
    let phraseData;
    if (type === 'audio') {
      phraseData = html`
        <div class=EditPhraseInputBlock>
          <label for=EditPhraseLabel>Label:</label>
          <input id=EditPhraseLabel @input=${onInput} .editPhraseField=${'label'}></input>
        </div>
        <div class=EditPhraseInputBlock>
          <label for=EditPhraseURl>URL for the audio clip:</label>
          <textarea id=EditPhraseURl @input=${onInput} pattern=${patternUrl} .editPhraseField=${'url'}></textarea>
        </div>
      `;
    } else if (type === 'youtube') {
      phraseData = html`
        <div class=EditPhraseInputBlock>
          <label for=EditPhraseLabel>Label:</label>
          <input id=EditPhraseLabel @input=${onInput} .editPhraseField=${'label'}></input>
        </div>
        <div class=EditPhraseInputBlock>
          <label for=EditPhraseVideoId>YouTube videoId for this clip:</label>
          <input id=EditPhraseVideoId @input=${onInput} pattern=${patternVideoId} .editPhraseField=${'videoId'}></input>
        </div>
        <div class=EditPhraseInputBlock>
          <label for=EditPhraseStartAt>Start at: (seconds, default=0)</label>
          <input id=EditPhraseStartAt @input=${onInput} pattern=${patternSeconds} .editPhraseField=${'startAt'}></input>
        </div>
        <div class=EditPhraseInputBlock>
          <label for=EditPhraseEndAt>End at: (seconds, default=end of clip)</label>
          <input id=EditPhraseEndAt @input=${onInput} pattern=${patternSeconds} .editPhraseField=${'endAt'}></input>
        </div>
      `;
    } else {
      phraseData = html`
        <div class=EditPhraseInputBlock>
          <label for=EditPhraseText>Text to be spoken:</label>
          <textarea id=EditPhraseText @input=${onInput} .editPhraseField=${'text'}></textarea>
        </div>
        <div class=EditPhraseInputBlock>
          <label for=EditPhraseLabel>${textLabelRequired ? 'Label:' : 'Optional label:'}</label>
          <input id=EditPhraseLabel @input=${onInput} .editPhraseField=${'label'}></input>
        </div>
      `;
    }
    render(html`
      <style>${css}</style>
      <div class="EditPhrase skinnyScreenParent">
        <div class=skinnyScreenChild>
          ${buildSlideRightTitle(title, null)}
          <div class=EditPhraseContent>
            <div class=TabControlRadioButtons>
              ${buildTypeRadioButton('EditPhraseTypeText', 'text', 'Spoken text')}
              ${buildTypeRadioButton('EditPhraseTypeAudio', 'audio', 'Web audio')}
              ${buildTypeRadioButton('EditPhraseTypeYoutube', 'youtube', 'YouTube video')}
            </div>
            <div class=TabControlRadioData>
              ${phraseData}
            </div>
            <div class=EditPhraseCustomControls></div>
            <div class="ButtonRow EditPhraseDoitButtonRow">
              <button id=EditPhraseTestButton @click=${onClickTest}>Test</button>
              <button id=EditPhraseDoitButton @click=${onClickDoit}>${doItButtonLabel}</button>
              <button @click=${onClickCancel}>Cancel</button>
            </div>
          </div>
        </div>
      </div>
    </div>`, parentElement);
    if (customControlsFunc) {
      customControlsFunc(document.querySelector('.EditPhraseCustomControls'), customControlsData);
    }
    // lit-html mysteriously does not update the value properties with subsequent renders
    if (type === 'text') {
      document.getElementById('EditPhraseText').value = text;
      document.getElementById('EditPhraseLabel').value = label;
    } else if (type === 'audio') {
      document.getElementById('EditPhraseLabel').value = label;
      document.getElementById('EditPhraseURl').value = url;
    } else if (type === 'youtube') {
      document.getElementById('EditPhraseLabel').value = label;
      document.getElementById('EditPhraseVideoId').value = videoId;
      document.getElementById('EditPhraseStartAt').value = startAt;
      document.getElementById('EditPhraseEndAt').value = endAt;
    }
  };
  localUpdate();
  validateData();
}
