/* ==========================================================================
   MÓDULO DE INTERFACE (GUI Layer)
   Responsabilidade: Encapsular EXCLUSIVAMENTE a criação, renderização e
   interação dos componentes visuais. Sem regras de negócio e sem chamadas
   de rede. Toda lógica de validação é delegada ao Domain.
   ========================================================================== */

/**
 * @class PainelRegistroRmo
 * @description Componente de UI responsável pelo painel CRUD de registro de RMO.
 * Constrói a interface via UIFacade e expõe hooks (callbacks) para o Controller
 * escutar eventos sem acoplamento direto.
 *
 * Padrão adotado: o painel usa `persist: true` para sobreviver ao fechamento (X),
 * evitando re-renderizações desnecessárias a cada toggle.
 */
class PainelRegistroRmo {

    /* ==============================
       CONFIGURAÇÕES DO COMPONENTE
       ============================== */
    static PAINEL_ID = 'rmo-registrador-panel';

    /**
     * @param {UIFacade} uiFacade - Instância da biblioteca de UI injetada.
     */
    constructor(uiFacade) {
        if (!uiFacade) throw new Error('[PainelRegistroRmo] UIFacade é obrigatório.');
        this._ui = uiFacade;

        /** @type {Panel|null} Referência ao componente Panel (lazy build) */
        this._painel = null;

        /** @type {HTMLSelectElement|null} */
        this._selectStatus = null;

        /** @type {HTMLTextAreaElement|null} */
        this._textareaDescricao = null;

        /** @type {HTMLButtonElement|null} */
        this._btnSalvar = null;

        // Hook público: o Controller atribui uma função aqui para ouvir a submissão.
        // Assim a GUI não precisa conhecer a lógica de negócio.
        this.onSalvarClicado = null;
    }

    // ========================================================================
    // CICLO DE VIDA DO COMPONENTE
    // ========================================================================

    /**
     * Constrói o painel com o estado inicial da RMO na primeira abertura.
     * Chamado pelo Controller apenas uma vez.
     *
     * @param {RmoRegistroModel} modelo - Estado atual da aplicação.
     */
    construir(modelo) {
        // Ícone usa currentColor para herdar a cor do texto do contexto onde está inserido
        const iconeRegistro = IconSet.get('FLOPPY', { color: 'currentColor', fill: true, size: '16px' });
        this._numeroRmo = modelo.idRmo;

        // Gera as <option> do select a partir do Domain (fonte da verdade dos status)
        const opcoesStatus = StatusRmo.obterOpcoes().map(s => {
            const selecionado = modelo.status.valor === s ? 'selected' : '';
            return `<option value="${s}" ${selecionado}>${s}</option>`;
        }).join('');

        const htmlFormulario = `
            <div id="rmo-reg-kv-numero"></div>

            <div class="pts-group" style="margin-top: 12px;">
                <label class="pts-label">Status da Fiscalização</label>
                <select id="rmo-reg-status" class="pts-input">
                    <option value="" disabled ${!modelo.status.estaDefinido() ? 'selected' : ''}>
                        Selecione um status...
                    </option>
                    ${opcoesStatus}
                </select>
            </div>

            <div class="pts-group" style="margin-top: 12px;">
                <label class="pts-label">Descrição da Matéria-Prima</label>
                <textarea
                    id="rmo-reg-descricao"
                    class="pts-input"
                    rows="4"
                    placeholder="Detalhes da fiscalização..."
                    style="resize: none; overflow-y: auto;"
                >${modelo.descricao}</textarea>
            </div>

            <div id="rmo-reg-feedback" style="margin-top: 10px; display: none;"></div>

            <div style="margin-top: 16px; border-top: 1px solid var(--th-bg-light); padding-top: 14px;">
                <button
                    id="rmo-reg-btn-salvar"
                    class="pts-btn pts-btn--success"
                    style="width: 100%;"
                    disabled
                >
                    ${iconeRegistro} Salvar Registro
                </button>
            </div>
        `;

        this._painel = new Panel(this._ui.core, {
            id:          PainelRegistroRmo.PAINEL_ID,
            title:       `${IconSet.get('FLOPPY', { color: 'currentColor', fill: true, size: '16px' })} Registrar RMO`,
            width:       '400px',
            persist:     true,  // O painel sobrevive ao fechar (hide), não é destruído
            closeButton: true,
            draggable:   true,
            content:     htmlFormulario,
        });

        this._painel.mount();
        this._painel.show();

        this._vincularElementosInternativos();
        this._configurarValidacaoReativa(modelo);
    }

    /**
     * Alterna a visibilidade do painel. Se ainda não foi construído, não faz nada
     * (o Controller controla quando construir).
     */
    toggle() {
        if (!this._painel) return;
        const estaVisivel = this._painel.el.style.display !== 'none';
        estaVisivel ? this._painel.hide() : this._painel.show();
    }

    /**
     * Exibe o painel (sem reconstruir).
     */
    mostrar() {
        if (this._painel) this._painel.show();
    }

    /**
     * Indica se o painel já foi construído no DOM.
     * @returns {boolean}
     */
    get foiConstruido() {
        return this._painel !== null;
    }

    // ========================================================================
    // ATUALIZAÇÃO DE ESTADO (chamados pelo Controller após ações assíncronas)
    // ========================================================================

    /**
     * Bloqueia ou desbloqueia os inputs e o botão de salvar durante operações I/O.
     * @param {boolean} ativo - true = bloquear, false = desbloquear.
     */
    bloquearForm(ativo) {
        if (!this._selectStatus || !this._textareaDescricao || !this._btnSalvar) return;

        this._selectStatus.disabled    = ativo;
        this._textareaDescricao.disabled = ativo;
        // O botão volta para o estado baseado na validação, não simplesmente habilita
        if (!ativo) {
            this._dispararValidacao();
        } else {
            this._btnSalvar.disabled = true;
            this._btnSalvar.style.opacity = '0.5';
            this._btnSalvar.style.cursor  = 'not-allowed';
        }
    }

    /**
     * Exibe uma mensagem de status/feedback visual dentro do painel.
     * @param {string} mensagem - Texto a exibir.
     * @param {'success'|'error'|'warning'|'loading'|'info'} tipo
     */
    atualizarFeedback(mensagem, tipo) {
        const container = this._painel?.el?.querySelector('#rmo-reg-feedback');
        if (!container) return;

        const icones = {
            success: IconSet.get('CHECK_CIRCLE', { color: 'var(--th-success)', fill: true }),
            error:   IconSet.get('EXCLAMATION_TRIANGLE', { color: 'var(--th-error)', fill: true }),
            warning: IconSet.get('EXCLAMATION_TRIANGLE', { color: 'var(--th-warning)', fill: true }),
            info:    IconSet.get('INFO_CIRCLE', { color: 'var(--th-info)', fill: true }),
            loading: IconSet.loading({ size: '16px', color: 'var(--th-primary)' }),
        };

        container.style.display = 'flex';
        container.style.alignItems = 'center';
        container.style.gap = '8px';
        container.style.fontSize = '13px';
        container.innerHTML = `${icones[tipo] || ''} <span>${mensagem}</span>`;
    }

    /**
     * Oculta a área de feedback do painel.
     */
    limparFeedback() {
        const container = this._painel?.el?.querySelector('#rmo-reg-feedback');
        if (container) {
            container.style.display = 'none';
            container.innerHTML = '';
        }
    }

    // ========================================================================
    // MÉTODOS PRIVADOS (internos ao componente)
    // ========================================================================

    /**
     * Captura as referências dos elementos do DOM após a montagem do painel.
     * @private
     */
    _vincularElementosInternativos() {
        const corpo = this._painel.el;
        this._selectStatus      = corpo.querySelector('#rmo-reg-status');
        this._textareaDescricao = corpo.querySelector('#rmo-reg-descricao');
        this._btnSalvar         = corpo.querySelector('#rmo-reg-btn-salvar');

        // Monta o KeyValue do Nº da RMO usando os componentes nativos da UIFactory.
        // O CopyableText é passado como valor HTMLElement, que o KeyValue aceita nativamente.
        const ancoraNúmero = corpo.querySelector('#rmo-reg-kv-numero');
        if (ancoraNúmero) {
            const textoCopia = new CopyableText(
                this._ui.core,
                ancoraNúmero, // parent temporário — será movido pelo KeyValue
                this._numeroRmo || '—',
                this._numeroRmo || null,
                'Clique para copiar o Nº da RMO',
                'info' // azul via var(--th-info)
            );
            // Aumenta a fonte do número destacado após a instanciação
            textoCopia.el.style.fontSize = '18px';

            // O KeyValue aceita HTMLElement como valor e o monta dentro do seu container
            const kv = new KeyValue(this._ui.core, ancoraNúmero, 'Nº da RMO', textoCopia.getNode());
            kv.mount();
        }

        // Conecta o clique do botão ao hook externo do Controller
        this._btnSalvar.addEventListener('click', () => {
            if (typeof this.onSalvarClicado === 'function' && !this._btnSalvar.disabled) {
                this.onSalvarClicado({
                    status:    this._selectStatus.value,
                    descricao: this._textareaDescricao.value,
                });
            }
        });
    }

    /**
     * Configura os listeners de validação reativa nos campos do formulário.
     * A lógica de "o que é válido" vem do Domain (via modelo), mas quem
     * reage ao evento e dispara o teste é responsabilidade da GUI.
     *
     * @param {RmoRegistroModel} modelo - Referência ao modelo de estado.
     * @private
     */
    _configurarValidacaoReativa(modelo) {
        // Cada mudança de campo atualiza o modelo e reavalia a validade
        this._selectStatus.addEventListener('change', () => {
            // Atualiza o model com o novo status (pode jogar erro se inválido, que não ocorre pois select é restrito)
            try { modelo.status = new StatusRmo(this._selectStatus.value); } catch (e) {}
            modelo.descricao = this._textareaDescricao.value;
            this._dispararValidacao(modelo);
        });

        this._textareaDescricao.addEventListener('input', () => {
            modelo.descricao = this._textareaDescricao.value;
            this._dispararValidacao(modelo);
        });

        // Validação inicial (garante estado correto se RMO já estava carregada)
        this._dispararValidacao(modelo);
    }

    /**
     * Avalia se o formulário está válido (delegando para o Domain) e aplica
     * o estado visual correto ao botão de salvar.
     *
     * @param {RmoRegistroModel} [modelo] - O modelo atual. Se omitido, usa o estado dos inputs diretamente.
     * @private
     */
    _dispararValidacao(modelo = null) {
        if (!this._btnSalvar) return;

        let estaValido = false;
        if (modelo) {
            estaValido = modelo.estaValido();
        } else {
            // Fallback direto: lê os inputs sem modelo (usado em bloquearForm/false)
            const statusAtual    = this._selectStatus?.value     || '';
            const descricaoAtual = this._textareaDescricao?.value || '';
            try {
                const statusTemp = new StatusRmo(statusAtual || null);
                const modeloTemp = new RmoRegistroModel(null);
                modeloTemp.status    = statusTemp;
                modeloTemp.descricao = descricaoAtual;
                estaValido = modeloTemp.estaValido();
            } catch (e) {
                estaValido = false;
            }
        }

        this._btnSalvar.disabled      = !estaValido;
        this._btnSalvar.style.opacity = estaValido ? '1'            : '0.5';
        this._btnSalvar.style.cursor  = estaValido ? 'pointer'      : 'not-allowed';
    }
}
