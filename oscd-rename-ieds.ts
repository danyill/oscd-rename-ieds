import { css, html, LitElement, TemplateResult } from 'lit';
import { property, query, queryAll, state } from 'lit/decorators.js';

import { updateIED } from '@openenergytools/scl-lib';
import { newEditEvent } from '@openscd/open-scd-core';

import type { MdDialog } from '@material/web/dialog/dialog.js';
import type { MdOutlinedTextField } from '@material/web/textfield/outlined-text-field.js';
import type { MdFilledTextField } from '@material/web/textfield/filled-text-field.js';

import '@material/web/button/outlined-button.js';
import '@material/web/dialog/dialog.js';
import '@material/web/textfield/filled-text-field.js';
import '@material/web/textfield/outlined-text-field';
import '@material/web/icon/icon.js';
import '@material/web/button/text-button.js';
import '@material/web/iconbutton/icon-button.js';

/**
 * Creates a regular expression to allow case-insensitive searching of list
 * items.
 *
 * * Supports globbing with * and
 * * Supports quoting using both ' and " and is an AND-ing search which
 *   narrows as further search text is added.
 *
 * @param searchExpression
 * @returns a regular expression
 */
function getSearchRegex(searchExpression: string): RegExp {
  if (searchExpression === '') {
    return /.*/i;
  }
  const terms: string[] =
    searchExpression
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .trim()
      .match(/(?:[^\s"']+|['"][^'"]*["'])+/g) ?? [];

  const expandedTerms = terms.map(term =>
    term.replace(/\*/g, '.*').replace(/\?/g, '.{1}').replace(/"|'/g, '')
  );

  const regexString = expandedTerms.map(term => `(?=.*${term})`);

  return new RegExp(`${regexString.join('')}.*`, 'i');
}

function debounce(callback: any, delay = 100) {
  let timeout: any;

  return (...args: any) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      callback(...args);
    }, delay);
  };
}

function getIedDescription(ied: Element): {
  firstLine: string;
  secondLine: string;
} {
  const [
    manufacturer,
    type,
    desc,
    configVersion,
    originalSclVersion,
    originalSclRevision,
    originalSclRelease,
  ] = [
    'manufacturer',
    'type',
    'desc',
    'configVersion',
    'originalSclVersion',
    'originalSclRevision',
    'originalSclRelease',
  ].map(attr => ied?.getAttribute(attr));

  const firstLine = [manufacturer, type]
    .filter(val => val !== null)
    .join(' - ');

  const schemaInformation = [
    originalSclVersion,
    originalSclRevision,
    originalSclRelease,
  ]
    .filter(val => val !== null)
    .join('');

  const secondLine = [desc, configVersion, schemaInformation]
    .filter(val => val !== null)
    .join(' - ');

  return { firstLine, secondLine };
}

export default class RenameIEDsPlugin extends LitElement {
  @property({ attribute: false })
  doc!: XMLDocument;

  @state()
  editCount = -1;

  @property({ type: String })
  searchIedsRegex: RegExp = /.*/i;

  @property({ type: Boolean })
  allIedNamesValid: boolean = true;

  @property({ type: Set })
  iedsToRename: string[] = [];

  @query('md-dialog') dialogUI!: MdDialog;

  @query('#ied-list') iedListUI!: HTMLUListElement;

  @query('#searchIeds')
  searchIedsUI?: MdOutlinedTextField;

  @queryAll('#ied-list li.item:not(.hidden)')
  iedListItems?: NodeList[];

  async run(): Promise<void> {
    if (this.searchIedsUI) {
      this.searchIedsUI.value = '';
    }

    if (this.iedListUI) {
      Array.from(
        this.iedListUI.querySelectorAll('md-filled-text-field')
      ).forEach(listIed => {
        // eslint-disable-next-line no-param-reassign
        listIed.value = listIed.getAttribute('data-old-name')!;
        listIed.setCustomValidity('');
        listIed.reportValidity();
        listIed.classList.remove('hidden', 'changed');
      });
    }

    this.iedsToRename = [];
    this.allIedNamesValid = true;

    this.dialogUI.show();
  }

  async docUpdate(): Promise<void> {
    await ((this.getRootNode() as ShadowRoot).host as LitElement)
      .updateComplete;
  }

  duplicatedIedName(iedName: string): boolean {
    if (!this.iedListUI || !this.doc) return false;

    const newNames = Array.from(
      this.iedListUI.querySelectorAll('md-filled-text-field')
    ).map(listIed => listIed.value);

    const iedNames = Array.from(newNames).filter(name => name === iedName);

    return iedNames.length !== 1;
  }

  customCheckValidity(iedElement: MdFilledTextField): boolean {
    if (!(iedElement && iedElement.validity)) return false;

    if (iedElement.validity.valueMissing) {
      iedElement.setCustomValidity('You must fill in this field.');
    } else if (iedElement.validity.patternMismatch) {
      iedElement.setCustomValidity(
        'Please use A-Z,0-9 and _ and start with a letter.'
      );
    } else if (iedElement.validity.tooLong || iedElement.validity.tooShort) {
      iedElement.setCustomValidity(
        'IED name must be > 1 character and < 64 characters.'
      );
    } else if (this.duplicatedIedName(iedElement.value)) {
      iedElement.setCustomValidity('IED name must be unique.');
    } else {
      iedElement.setCustomValidity('');
      iedElement.reportValidity();
      return true;
    }

    iedElement.reportValidity();
    return false;
  }

  // eslint-disable-next-line class-methods-use-this
  protected renderIedItem(ied: Element): TemplateResult {
    const { firstLine, secondLine } = getIedDescription(ied);
    const oldName = ied.getAttribute('name')!;
    return html`<li class="item">
        <md-icon>developer_board</md-icon>
        <div
          class="list-text"
          title="${firstLine}
${secondLine}"
        >
          <md-filled-text-field
            required
            minLength="1"
            maxLength="64"
            pattern="[A-Za-z][0-9A-Za-z_]*"
            label="Name"
            value="${oldName}"
            supporting-text="Previously named ${oldName}"
            data-identity="${oldName}"
            data-old-name="${oldName}"
            @input="${(event: any) => {
              const iedElement = <MdFilledTextField>event.target;
              this.customCheckValidity(iedElement);

              this.allIedNamesValid = Array.from(
                this.iedListUI.querySelectorAll('md-filled-text-field')
              )
                .map(listIed => this.customCheckValidity(listIed))
                .reduce((acc, current) => acc && current);

              if (iedElement.value !== oldName) {
                if (!this.iedsToRename.includes(`${oldName}`))
                  this.iedsToRename.push(`${oldName}`);
                this.iedsToRename = [...this.iedsToRename];
                iedElement.classList.add('changed');
              } else {
                this.iedsToRename = this.iedsToRename.filter(
                  item => item !== `${oldName}`
                );
                iedElement.classList.remove('changed');
              }
            }}"
          >
          </md-filled-text-field>
          <div class="details">
            <div class="first-line">${firstLine}</div>
            <div class="second-line">${secondLine}</div>
          </div>
        </div>
      </li>
      <md-divider></md-divider>`;
  }

  render(): TemplateResult {
    if (!this.doc) return html``;

    return html`<md-dialog @cancel=${(event: Event) => event.preventDefault()}>
      <div slot="headline">Rename IEDs</div>
      <div slot="content">
        <md-outlined-text-field
          class="info-item"
          id="searchIeds"
          placeholder="Search IEDs"
          @input=${debounce(() => {
            this.searchIedsRegex = getSearchRegex(
              this.searchIedsUI?.value ?? ''
            );

            Array.from(this.iedListUI?.querySelectorAll('.item')).forEach(
              item => {
                const textField = item.querySelector('md-filled-text-field');
                const searchText = `${
                  item.querySelector('.details .first-line')?.textContent
                } ${item.querySelector('.details .second-line')?.textContent} ${
                  textField?.value
                } ${textField?.getAttribute('data-old-name')}`;

                if (
                  !this.searchIedsRegex.test(searchText) &&
                  this.searchIedsUI?.value !== ''
                ) {
                  item.classList.add('hidden');
                } else {
                  item.classList.remove('hidden');
                }
              }
            );
          })}
        >
          <md-icon slot="leading-icon">search</md-icon>
          <md-icon-button
            class="${this.searchIedsUI && this.searchIedsUI.value === ''
              ? 'hidden'
              : ''}"
            slot="trailing-icon"
            @click="${() => {
              if (this.searchIedsUI) {
                this.searchIedsUI.value = '';
                this.searchIedsRegex = /.*/;
              }

              Array.from(this.iedListUI?.querySelectorAll('.item')).forEach(
                item => {
                  item.classList.remove('hidden');
                }
              );
            }}"
          >
            <md-icon>close</md-icon>
          </md-icon-button>
        </md-outlined-text-field>
        <ul id="ied-list">
          ${Array.from(this.doc.querySelectorAll(':root > IED'))
            .sort((a, b) => {
              const aSortstring = Array.from(
                Object.entries(getIedDescription(a))
              ).join(' ');
              const bSortstring = Array.from(
                Object.entries(getIedDescription(b))
              ).join(' ');
              return aSortstring.localeCompare(bSortstring);
            })
            .map(ied => this.renderIedItem(ied))}
        </ul>
      </div>
      <div slot="actions">
        <md-text-button @click=${() => this.dialogUI.close()}
          >Close</md-text-button
        >
        <md-text-button
          ?disabled=${this.iedsToRename.length === 0 || !this.allIedNamesValid}
          @click=${() => {
            Array.from(this.iedListUI?.querySelectorAll('.item')).forEach(
              item => {
                const textField = item.querySelector('md-filled-text-field')!;
                const newIedName = textField.value;
                const oldIedName = textField.getAttribute(`data-old-name`);

                const ied = this.doc.querySelector(
                  `:root > IED[name="${oldIedName}"]`
                );

                if (ied)
                  this.dispatchEvent(
                    newEditEvent(
                      updateIED({
                        element: ied,
                        attributes: { name: newIedName },
                      })
                    )
                  );
              }
            );

            this.dialogUI.close();
          }}
          >Rename IEDs (${this.iedsToRename.length})</md-text-button
        >
      </div>
    </md-dialog>`;
  }

  static styles = css`
    li.item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-top: 8px;
      padding-bottom: 8px;
      max-width: 100%;
    }

    li.item.hidden {
      display: none;
    }

    li.item.hidden + md-divider {
      display: none;
    }

    .second-line {
      font-weight: 400;
      color: var(--mdc-theme-secondary, rgba(0, 0, 0, 0.54));
      font-size: 0.875rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .list-text {
      width: 100%;
      overflow: hidden;
    }

    md-icon {
      --mdc-icon-size: 32px;
    }

    md-outlined-text-field {
      width: 100%;
    }

    md-filled-text-field.changed {
      --_container-color: #9bed9b;
    }

    .list-text {
      padding-right: 10px;
    }

    .details {
      padding: 5px;
    }

    md-icon {
      padding-right: 15px;
    }
  `;
}
