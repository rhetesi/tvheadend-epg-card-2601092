class TvheadendEpgCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });

    this._hass = null;
    this._epg = [];
    this._entryId = null;
    this._loading = false;
    this._error = null;

    // UI konstansok
    this.PX_PER_MIN = 4; // mobilon is jól használható
    this.CHANNEL_COL_WIDTH = 140;
  }

  setConfig(config) {
    this.config = config || {};
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._entryId && hass) {
      this._resolveEntryId();
    }
    this._render();
  }

  connectedCallback() {
    if (this._entryId) {
      this._fetchEpg();
    }
  }

  /* -----------------------------
   * ENTRY ID
   * ----------------------------- */
  async _resolveEntryId() {
    try {
      const entries = await this._hass.connection.sendMessagePromise({
        type: "config_entries/get",
        domain: "tvheadend_epg",
      });

      if (!entries?.length) {
        this._error = "TVHeadend EPG integráció nem található";
        return this._render();
      }

      this._entryId = entries[0].entry_id;
      await this._fetchEpg();
    } catch (e) {
      console.error(e);
      this._error = "Integráció azonosítási hiba";
      this._render();
    }
  }

  /* -----------------------------
   * EPG FETCH
   * ----------------------------- */
  async _fetchEpg() {
    if (!this._hass || !this._entryId) return;

    this._loading = true;
    this._error = null;
    this._render();

    try {
      const result = await this._hass.connection.sendMessagePromise({
        type: "tvheadend_epg/fetch",
        entry_id: this._entryId,
      });

      this._epg = Array.isArray(result.epg) ? result.epg : [];
    } catch (e) {
      console.error(e);
      this._error = "EPG betöltési hiba";
    } finally {
      this._loading = false;
      this._render();
    }
  }

  /* -----------------------------
   * RENDER
   * ----------------------------- */
  _render() {
    if (!this.shadowRoot) return;

    const style = `
      <style>
        ha-card {
          padding: 0;
          overflow: hidden;
        }

        .header {
          padding: 12px 16px;
          font-size: 18px;
          font-weight: 600;
          border-bottom: 1px solid var(--divider-color);
        }

        .container {
          display: flex;
          height: 420px;
          overflow: auto;
          -webkit-overflow-scrolling: touch;
        }

        .channels {
          position: sticky;
          left: 0;
          z-index: 2;
          background: var(--card-background-color);
          border-right: 1px solid var(--divider-color);
          min-width: ${this.CHANNEL_COL_WIDTH}px;
        }

        .channel {
          height: 64px;
          padding: 6px 8px;
          font-size: 13px;
          font-weight: 600;
          border-bottom: 1px solid var(--divider-color);
          display: flex;
          align-items: center;
        }

        .grid {
          position: relative;
          flex: 1;
        }

        .row {
          position: relative;
          height: 64px;
          border-bottom: 1px solid var(--divider-color);
        }

        .event {
          position: absolute;
          top: 6px;
          bottom: 6px;
          background: var(--primary-color);
          color: white;
          padding: 4px 6px;
          border-radius: 6px;
          font-size: 12px;
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
        }

        .loading,
        .error {
          padding: 16px;
        }
      </style>
    `;

    if (this._loading) {
      return (this.shadowRoot.innerHTML = `
        ${style}
        <ha-card><div class="loading">EPG betöltése…</div></ha-card>
      `);
    }

    if (this._error) {
      return (this.shadowRoot.innerHTML = `
        ${style}
        <ha-card><div class="error">${this._error}</div></ha-card>
      `);
    }

    if (!this._epg.length) {
      return (this.shadowRoot.innerHTML = `
        ${style}
        <ha-card><div class="loading">Nincs EPG adat</div></ha-card>
      `);
    }

    /* -----------------------------
     * ADAT ELŐKÉSZÍTÉS
     * ----------------------------- */
    const byChannel = {};
    let minStart = Infinity;
    let maxEnd = 0;

    for (const e of this._epg) {
      if (!byChannel[e.channelUuid]) {
        byChannel[e.channelUuid] = {
          number: Number(e.channelNumber) || 0,
          name: e.channelName,
          events: [],
        };
      }
      byChannel[e.channelUuid].events.push(e);
      minStart = Math.min(minStart, e.start);
      maxEnd = Math.max(maxEnd, e.stop);
    }

    const channels = Object.values(byChannel).sort(
      (a, b) => a.number - b.number
    );

    const totalMinutes = (maxEnd - minStart) / 60;
    const gridWidth = totalMinutes * this.PX_PER_MIN;

    /* -----------------------------
     * HTML
     * ----------------------------- */
    const channelCol = channels
      .map(
        (c) =>
          `<div class="channel">${c.number} – ${c.name}</div>`
      )
      .join("");

    const rows = channels
      .map((c) => {
        const events = c.events
          .map((e) => {
            const left =
              ((e.start - minStart) / 60) * this.PX_PER_MIN;
            const width =
              ((e.stop - e.start) / 60) * this.PX_PER_MIN;

            return `
              <div class="event" style="left:${left}px;width:${width}px">
                ${e.title}
              </div>
            `;
          })
          .join("");

        return `<div class="row" style="width:${gridWidth}px">${events}</div>`;
      })
      .join("");

    this.shadowRoot.innerHTML = `
      ${style}
      <ha-card>
        <div class="header">TVHeadend EPG</div>
        <div class="container">
          <div class="channels">${channelCol}</div>
          <div class="grid">${rows}</div>
        </div>
      </ha-card>
    `;
  }

  getCardSize() {
    return 6;
  }
}

customElements.define("tvheadend-epg-card", TvheadendEpgCard);
