/* ==========================================================================
   MÓDULO DE APRESENTAÇÃO (View / GUI Layer)
   Responsabilidade: Interagir diretamente com o DOM da página de RMOs,
   injetando componentes de feedback visual e elementos do Design System.
   ========================================================================== */

/**
 * @class ItemRMO
 * @description Classe responsável por aplicar a colorização e injetar o tooltip descritivo em uma linha da tabela correspondente a um item de RMO.
 */
class ItemRMO {
    /**
     * @param {HTMLTableRowElement} linhaDom - Elemento correspondente à linha (TR) da tabela no DOM.
     * @param {UIFacade} uiFacade - Biblioteca de componentes visuais do sistema.
     */
    constructor(linhaDom, uiFacade) {
        if (!linhaDom) throw new Error('[ItemRMO] linhaDom é obrigatória.');
        if (!uiFacade) throw new Error('[ItemRMO] uiFacade é obrigatória.');
        this._linhaDom = linhaDom;
        this._ui = uiFacade;
    }

    /**
     * Aplica a cor de fundo correspondente ao status da RMO na linha do DOM.
     * @param {string} corFundo - A cor de fundo em formato CSS (ex: rgba).
     */
    aplicarCorFundo(corFundo) {
        this._linhaDom.style.backgroundColor = corFundo;
    }

    /**
     * Injeta o tooltip com o ícone de informação de status na segunda célula (célula de status) da linha.
     * Utiliza o IconButton nativo da UIFacade (não clicável) para exibir a descrição.
     * @param {string} descricao - Texto explicativo com a justificativa do status.
     */
    injetarTooltip(descricao) {
        const celulaStatus = this._linhaDom.cells && this._linhaDom.cells[1];
        if (celulaStatus) {
            const temIconeNativo = celulaStatus.querySelector('img') !== null;
            const temNossoIcone = celulaStatus.querySelector('.pts-btn-icon') !== null;

            // Apenas adiciona se não houver um ícone do próprio sistema ou do nosso script anterior
            if (!temIconeNativo && !temNossoIcone) {
                const iconeSvg = this._ui.icons.get('info-circle-fill', {
                    size: '14px',
                    color: 'var(--th-info)'
                });

                // Cria o IconButton inline da UIFacade sem callback (não-clicável) que exibe o tooltip no hover
                const tooltipBtn = this._ui.createIconButton(celulaStatus, iconeSvg, null, descricao, true);
                tooltipBtn.mount();
            }
        }
    }
}

/**
 * @class BotaoFab
 * @description Classe responsável por encapsular a lógica de criação e gerenciamento de estado do Floating Action Button (FAB) na tela.
 */
class BotaoFab {
    /**
     * @param {UIFacade} uiFacade - Biblioteca de componentes visuais do sistema.
     * @param {Function} onClick - Callback invocado quando o usuário clica no botão.
     */
    constructor(uiFacade, onClick) {
        if (!uiFacade) throw new Error('[BotaoFab] UIFacade é obrigatória.');
        if (typeof onClick !== 'function') {
            throw new Error('[BotaoFab] Callback onClick é obrigatório para o FAB.');
        }
        this._ui = uiFacade;
        this._onClick = onClick;
        this._fab = null;
    }

    /**
     * Cria e monta o botão flutuante no DOM da página.
     * @returns {FabButton} A instância do FAB criado.
     */
    criarBotao() {
        const iconeSvg = this._ui.icons.get('repeat', { size: '18px' });
        this._fab = this._ui.createFab(iconeSvg, this._onClick, 'Sincronizar RMOs', 0);
        this._fab.mount();
        return this._fab;
    }

    /**
     * Atualiza o estado visual e interativo do botão (carregando/idle).
     * @param {boolean} carregando - Se true, desativa o botão e exibe a ampulheta animada.
     */
    atualizarDados(carregando) {
        if (!this._fab) return;
        if (carregando) {
            const iconeLoading = this._ui.icons.loading({ size: '18px' });
            this._fab.setIcon(iconeLoading);
            this._fab.disable();
        } else {
            const iconeRepeat = this._ui.icons.get('repeat', { size: '18px' });
            this._fab.setIcon(iconeRepeat);
            this._fab.enable();
        }
    }
}

/**
 * @class TabelaRmos
 * @description Classe especialista em gerenciar e aplicar a estilização geral, a reestilização estrutural
 * e a colorização das linhas da tabela de RMOs.
 */
class TabelaRmos {
    /**
     * @param {UIFacade} uiFacade - Biblioteca de componentes visuais do sistema.
     */
    constructor(uiFacade) {
        if (!uiFacade) throw new Error('[TabelaRmos] uiFacade é obrigatório.');
        this._ui = uiFacade;

        /**
         * @private
         * @type {Object<string, string>}
         * @description Mapeamento de cores baseado no P0nt4sTheme.css adaptado para o tema claro (opacidade de 0.20 para excelente contraste).
         */
        this._coresStatus = {
            'Regular': 'rgba(16, 185, 129, 0.2)',                 // Verde (th-success)
            'Irregular': 'rgba(239, 68, 68, 0.2)',                // Vermelho (th-error)
            'Informações Insuficientes': 'rgba(251, 191, 36, 0.2)' // Amarelo (th-warning)
        };
    }

    /**
     * Aplica a reestilização estética e estrutural moderna na tabela de RMOs.
     * Remove colunas desnecessárias, aplica limites de caracteres (truncamento) com tooltip,
     * padroniza a altura das linhas e ativa o comportamento de linha clicável.
     */
    reestilizar() {
        const tabela = document.querySelector('table.dataTable');
        if (!tabela) return;

        // 1. Injeta os estilos CSS modernos necessários apenas uma vez
        if (!document.getElementById('rmo-tabela-estilos')) {
            this._injetarEstilosTabela();
        }

        // 2. Remove as colunas desnecessárias dinamicamente baseando-se no data-field
        const colunasParaRemover = ['envios', 'anexar', 'anexos_cea', 'acesso'];
        colunasParaRemover.forEach(col => {
            this._removerColunaPorDataField(tabela, col);
        });

        // 3. Obtém dinamicamente os índices das colunas de Proprietário e Endereço para truncamento
        const thProp = tabela.querySelector('thead th[data-field="rmo_proprietario"]');
        const thEnd = tabela.querySelector('thead th[data-field="rmo_endereco"]');
        const idxProp = thProp ? Array.from(thProp.parentNode.children).indexOf(thProp) : -1;
        const idxEnd = thEnd ? Array.from(thEnd.parentNode.children).indexOf(thEnd) : -1;

        // 4. Percorre as linhas do corpo para configurar truncamento e clique
        const linhas = tabela.querySelectorAll('tbody tr');
        linhas.forEach(row => {
            if (row.cells.length < 2) return;

            // Truncamento na coluna Nome do Proprietário
            if (idxProp !== -1 && row.cells[idxProp]) {
                const celula = row.cells[idxProp];
                if (!celula.querySelector('.pts-cell-truncate')) {
                    const texto = celula.innerText.trim();
                    celula.innerHTML = `<span class="pts-cell-truncate" title="${texto}">${texto}</span>`;
                }
            }

            // Truncamento na coluna Endereço
            if (idxEnd !== -1 && row.cells[idxEnd]) {
                const celula = row.cells[idxEnd];
                if (!celula.querySelector('.pts-cell-truncate')) {
                    const texto = celula.innerText.trim();
                    celula.innerHTML = `<span class="pts-cell-truncate" title="${texto}" style="max-width: 300px;">${texto}</span>`;
                }
            }

            // Configura toda a linha como clicável (abre o link presente no botão de Editar)
            if (!row.dataset.clickConfigured) {
                const linkEdicao = row.querySelector('a.edit') || row.querySelector('a[title="Editar"]');
                if (linkEdicao) {
                    const href = linkEdicao.getAttribute('href');
                    row.addEventListener('click', (e) => {
                        // Não dispara o clique se o usuário interagiu com botões, links, ícones ou tooltips
                        if (e.target.closest('button, a, svg, path, .pts-btn-icon')) {
                            return;
                        }
                        window.location.href = href;
                    });
                    row.dataset.clickConfigured = 'true';
                }
            }
        });
    }

    /**
     * Remove uma coluna específica do cabeçalho e todas as suas células do corpo.
     * @private
     * @param {HTMLTableElement} tabela - Elemento da tabela.
     * @param {string} dataField - O valor do atributo data-field correspondente à coluna.
     */
    _removerColunaPorDataField(tabela, dataField) {
        const th = tabela.querySelector(`thead th[data-field="${dataField}"]`);
        if (!th) return;

        const index = Array.from(th.parentNode.children).indexOf(th);
        if (index === -1) return;

        th.remove();

        const linhas = tabela.querySelectorAll('tbody tr');
        linhas.forEach(linha => {
            if (linha.cells && linha.cells[index]) {
                linha.cells[index].remove();
            }
        });
    }

    /**
     * Injeta a folha de estilos CSS específicos do Sentinela para a tabela.
     * @private
     */
    _injetarEstilosTabela() {
        /* Valores hex fixos do tema claro do P0nt4sTheme.css:
         * --th-surface-dark (light): #f1f5f9  → cabeçalho
         * --th-text-muted   (light): #64748b  → texto do cabeçalho
         * --th-surface-light(light): #e2e8f0  → borda externa e fundo base
         * Usamos hex diretamente para evitar race condition com data-theme="light" */
        const css = `
            table.dataTable {
                border-collapse: separate !important;
                border-spacing: 0 !important;
                border-radius: 8px !important;
                overflow: hidden !important;
                border: 1px solid #e2e8f0 !important;
            }
            table.dataTable thead th {
                background-color: #f1f5f9 !important;
                color: #64748b !important;
                font-weight: 700 !important;
                text-transform: uppercase !important;
                font-size: 11px !important;
                letter-spacing: 0.5px !important;
                padding: 12px 16px !important;
                border-bottom: 1px solid #e2e8f0 !important;
                border-right: none !important;
                border-top: none !important;
                border-left: none !important;
            }
            table.dataTable tbody tr {
                transition: background-color 0.2s ease;
            }
            table.dataTable tbody tr:hover {
                background-color: rgba(109, 40, 217, 0.06) !important;
            }
            table.dataTable tbody tr td {
                padding: 10px 16px !important;
                height:65px !important;
                vertical-align: middle !important;
                border-top: 1px solid rgba(226, 232, 240, 0.7) !important;
                border-right: none !important;
                border-left: none !important;
            }
            .pts-cell-truncate {
                max-width: 180px;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                display: inline-block;
                vertical-align: middle;
            }
        `;
        const id = 'rmo-tabela-estilos';
        if (typeof GM_addStyle !== 'undefined') {
            GM_addStyle(css);
        } else {
            const style = document.createElement('style');
            style.id = id;
            style.textContent = css;
            document.head.appendChild(style);
        }
    }

    /**
     * Atualiza as linhas da tabela associadas aos itens de RMO fornecidos.
     * @param {RmoSentinelaItem[]} itens - Coleção de itens de RMO vindos do modelo.
     * @returns {number} Quantidade de linhas físicas efetivamente coloridas.
     */
    atualizar(itens) {
        if (!Array.isArray(itens)) return 0;

        let contadorColoridos = 0;

        itens.forEach(item => {
            const status = item.status.valor;
            const statusDefinido = item.status.verificaStatus();
            const corFundo = this._coresStatus[status];

            // Apenas colore as linhas e injeta tooltips se o status da RMO estiver definido/cadastrado
            if (statusDefinido && corFundo) {
                item.linhasDom.forEach(linha => {
                    const itemRmoVisual = new ItemRMO(linha, this._ui);
                    itemRmoVisual.aplicarCorFundo(corFundo);
                    itemRmoVisual.injetarTooltip(item.descricao);
                    contadorColoridos++;
                });
            }
        });

        return contadorColoridos;
    }
}
