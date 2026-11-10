import { esc, money } from './ui.js';
import { priceBreakdown } from './model.js';

export function extrasSection() {
  return /* HTML */ `<section class="extras-editor">
    <div class="extras-heading">
      <div>
        <h3>Adicionais</h3>
        <p>Variações, revisões, urgência… cobre pelo trabalho extra.</p>
      </div>
      <span class="badge">Opcional</span>
    </div>
    <div id="extras-list"></div>
    <div class="extra-presets">
      <button type="button" data-add-extra="Revisão extra">＋ Revisão</button
      ><button type="button" data-add-extra="Variação de thumbnail">＋ Variação</button
      ><button type="button" data-add-extra="Entrega urgente">＋ Urgência</button
      ><button type="button" data-add-extra="Adicional">＋ Personalizado</button>
    </div>
    <small id="extras-note" role="status"></small>
    <div class="price-summary">
      <span>Preço base <b id="base-preview"></b></span
      ><span>Adicionais <b id="extras-preview"></b></span
      ><strong>Total do trabalho <b id="total-preview"></b></strong>
    </div>
  </section>`;
}

export function bindPriceEditor(modal, initialExtras) {
  let extras = structuredClone(initialExtras);
  const refresh = () => {
    const price = priceBreakdown({
      baseValue: Number(modal.querySelector('#value').value) || 0,
      extras,
    });
    const currency = modal.querySelector('#currency').value;
    for (const [id, value] of [
      ['base-preview', price.base],
      ['extras-preview', price.extras],
      ['total-preview', price.total],
    ])
      modal.querySelector('#' + id).textContent = money(value, currency);
  };
  const draw = () => {
    modal.querySelector('#extras-list').innerHTML = extras
      .map(
        (extra, index) =>
          /* HTML */ `<div class="extra-row">
            <label
              >Descrição<input
                data-extra-name="${index}"
                value="${esc(extra.name)}"
                maxlength="120"
                required
                aria-label="Descrição do adicional ${index + 1}" /></label
            ><label
              >Qtd.<input
                type="number"
                data-extra-quantity="${index}"
                value="${extra.quantity}"
                min="1"
                max="100"
                step="1"
                required
                aria-label="Quantidade do adicional ${index + 1}" /></label
            ><label
              >Valor unitário<input
                type="number"
                data-extra-price="${index}"
                value="${extra.unitValue}"
                min="0"
                max="10000000"
                step="0.01"
                required
                aria-label="Valor do adicional ${index + 1}" /></label
            ><button
              type="button"
              data-remove-extra="${index}"
              aria-label="Remover adicional ${index + 1}"
            >
              ✕
            </button>
          </div>`,
      )
      .join('');
    for (const [attribute, property, numeric] of [
      ['extraName', 'name', false],
      ['extraQuantity', 'quantity', true],
      ['extraPrice', 'unitValue', true],
    ]) {
      const selector = attribute.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
      modal.querySelectorAll('[data-' + selector + ']').forEach(
        (input) =>
          (input.oninput = () => {
            extras[Number(input.dataset[attribute])][property] = numeric
              ? Number(input.value)
              : input.value;
            refresh();
          }),
      );
    }
    modal.querySelectorAll('[data-remove-extra]').forEach(
      (button) =>
        (button.onclick = () => {
          extras.splice(Number(button.dataset.removeExtra), 1);
          draw();
        }),
    );
    refresh();
  };
  modal.querySelectorAll('[data-add-extra]').forEach(
    (button) =>
      (button.onclick = () => {
        if (extras.length >= 30) {
          modal.querySelector('#extras-note').textContent =
            'Você pode adicionar até 30 itens por trabalho.';
          return;
        }
        extras.push({
          id: crypto.randomUUID(),
          name: button.dataset.addExtra,
          quantity: 1,
          unitValue: 0,
        });
        draw();
        modal.querySelector(`[data-extra-price="${extras.length - 1}"]`).focus();
      }),
  );
  modal.querySelector('#value').oninput = refresh;
  modal.querySelector('#currency').onchange = refresh;
  draw();
  return { refresh, getExtras: () => extras.map((e) => ({ ...e, name: e.name.trim() })) };
}
