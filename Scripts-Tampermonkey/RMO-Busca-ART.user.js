// ==UserScript==
// @name         RMO Caça ART (v9.8.0)
// @namespace    https://github.com/P0NT4S/
// @version      9.8.0
// @description  Orquestrador de buscas de ART 100% integrado ao Utils Data Mapper e UIFactory.
// @author       P0nt4s
// @match        https://mobile.creadf.org.br/sgf_web_21/www/*
// @updateURL    https://raw.githubusercontent.com/P0NT4S/sistema-crea/main/Scripts-Tampermonkey/RMO-Busca-ART.user.js
// @downloadURL  https://raw.githubusercontent.com/P0NT4S/sistema-crea/main/Scripts-Tampermonkey/RMO-Busca-ART.user.js
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_getResourceText
// @grant        GM_openInTab
// @grant        unsafeWindow
// @require      https://raw.githubusercontent.com/P0NT4S/sistema-crea/main/Libs/UIFactory.js
// @require      https://raw.githubusercontent.com/P0NT4S/sistema-crea/main/Libs/Utils.js
// @require      https://raw.githubusercontent.com/P0NT4S/sistema-crea/main/Libs/CommBridge.js
// @resource     P0nt4sTheme https://raw.githubusercontent.com/P0NT4S/sistema-crea/main/Libs/P0nt4sTheme.css
// ==/UserScript==

(function() {
    'use strict';

    /* ==========================================================================
       0. INJEÇÃO DO DESIGN SYSTEM (P0nt4sTheme)
       ========================================================================== */
    const themeCss = typeof GM_getResourceText !== "undefined" ? GM_getResourceText("P0nt4sTheme") : "";

    const customCss = `
        .art-link-title { font-weight: bold !important; font-family: monospace; font-size: 18px; }
        .input-locked { opacity: 0.6 !important; cursor: not-allowed !important; pointer-events: none !important; background-color: rgba(0,0,0,0.2) !important; }
    `;

    if (typeof GM_addStyle !== "undefined") {
        GM_addStyle(themeCss + customCss);
    } else {
        const styleEl = document.createElement('style');
        styleEl.textContent = themeCss + customCss;
        document.head.appendChild(styleEl);
    }

    /* ==========================================================================
       1. CONFIGURAÇÕES E INICIALIZAÇÃO
       ========================================================================== */
    const CONFIG = {
        SCRIPT_VERSION: "v9.8.0",
        PANEL_ID: "caca-art-painel",
        PAGES_INITIAL_LIMIT: 5,
        PAGES_INCREMENT: 5,
        API_ART_URL: "https://art.creadf.org.br/art1025/publico/consultas_ret.php"
    };

    if (!window.Utils || !window.Utils.crea || !window.UIFactory) {
        alert("Erro Crítico: Bibliotecas base não carregadas. Atualize no Tampermonkey.");
        return;
    }

    const Log = window.Utils.log;
    const UI = window.UIFactory;
    const T = UI.templates;
    const requestQueue = window.Comm.apiART.createQueue(3);

    let searchState = {
        mode: "address",
        logradouro: "", bairro: "", regexList: [],
        cnpj: "", contratoStr: "", contratoNum: "", contratoAno: "", contratoRegex: null,
        docCpfCnpj: "", docRegexList: [],
        currentPage: 0, limitPage: 0, totalPages: Infinity, totalResults: 0,
        isRunning: false, isCancelled: false,
        rmoIdAtual: ""
    };

    const artCache = {};

    /* ==========================================================================
       2. INTERFACE PRINCIPAL
       ========================================================================== */
    Log.init(`Caça ART ${CONFIG.SCRIPT_VERSION}`);
    let isInitialized = false;

    function startApp() {
        if (isInitialized) return;
        isInitialized = true;

        if (UI.theme && UI.theme.init) UI.theme.init();

        UI.createFab('🔍', "Alternar Caça ART", CONFIG.PANEL_ID, () => {
            if (!document.getElementById(CONFIG.PANEL_ID)) initCacaART();
        });
    }

    window.addEventListener('DOMContentLoaded', startApp);
    window.addEventListener('load', startApp);

    function initCacaART() {
        const data = extractPageData();

        // 1. Formulário de Endereço
        const htmlFormAddr = `
            ${T.formInput({ label: "Logradouro", id: "art-inp-logradouro", value: data.logradouro })}
            ${T.formInput({ label: "Bairro", id: "art-inp-bairro", value: data.bairro })}
            ${T.flexRow([
                { flex: 2, html: T.formInput({ label: "Filtros (CSV)", id: "art-inp-numeros", placeholder: 'Ex: 10, conj, "lote a"', value: data.numeros }) },
                { flex: 1, html: T.formInput({ label: "Pág. Inicial", id: "art-inp-page-addr", type: "number", value: "1", min: "1" }) }
            ])}
        `;

        // 2. Formulário de Contrato
        const htmlFormCont = `
            ${T.formInput({ label: "CNPJ do Contratante", id: "art-inp-cnpj", placeholder: "Ex: 00.000.000/0001-00" })}
            ${T.flexRow([
                { flex: 2, html: T.formInput({ label: "Contrato/Ano", id: "art-inp-contrato", placeholder: "Ex: 203/2025" }) },
                { flex: 1, html: T.formInput({ label: "Pág. Inicial", id: "art-inp-page-ctr", type: "number", value: "1", min: "1" }) }
            ])}
        `;

        // 3. Formulário de Documento (CPF/CNPJ)
        const htmlFormDoc = `
            ${T.formInput({ label: "CPF ou CNPJ do Proprietário", id: "art-inp-doc-cpfcnpj", placeholder: "Ex: 000.000.000-00 ou 00.000.000/0001-00" })}
            ${T.flexRow([
                { flex: 2, html: T.formInput({ label: "Filtro de Endereço (Opcional)", id: "art-inp-doc-endereco", placeholder: 'Ex: 10, conj, "lote a"' }) },
                { flex: 1, html: T.formInput({ label: "Pág. Inicial", id: "art-inp-page-doc", type: "number", value: "1", min: "1" }) }
            ])}
        `;

        const panel = UI.createPanel({
            id: CONFIG.PANEL_ID, title: "🕵️ Buscar ARTs", width: "550px", draggable: true, persist: true, closeButton: true,
            html: `
                <div id="form-address">${htmlFormAddr}</div>
                <div id="form-contract" style="display:none;">${htmlFormCont}</div>
                <div id="form-document" style="display:none;">${htmlFormDoc}</div>
                ${T.divider('', 'none')}
                <div class="pts-row" style="margin-top: 10px;">
                    <button id="art-btn-search" class="pts-btn pts-btn--primary pts-col">🔍 Pesquisar</button>
                    <button id="art-btn-cancel" class="pts-btn pts-btn--danger pts-col" style="display:none;">⛔ Parar Busca</button>
                </div>
                <div id="art-results-container" style="margin-top: 20px;"></div>
            `
        });

        const formAddr = panel.querySelector('#form-address');
        const formCont = panel.querySelector('#form-contract');
        const formDoc = panel.querySelector('#form-document');

        const toggleForms = (mode) => {
            searchState.mode = mode;
            formAddr.style.display = mode === 'address' ? 'block' : 'none';
            formCont.style.display = mode === 'contract' ? 'block' : 'none';
            formDoc.style.display  = mode === 'document' ? 'block' : 'none';
        };

        const tabsComponent = UI.createTabs({
            items: [
                { label: "📍 Por Endereço", active: true,  onClick: () => toggleForms('address') },
                { label: "📄 Por Contrato", active: false, onClick: () => toggleForms('contract') },
                { label: "👤 Por CPF/CNPJ", active: false, onClick: () => toggleForms('document') }
            ]
        });

        Array.from(tabsComponent.children).forEach(tab => {
            tab.style.flex = "1";
            tab.style.textAlign = "center";
        });

        const panelBody = panel.querySelector('.pts-panel-body');
        panelBody.insertBefore(tabsComponent, panelBody.firstChild);

        rebind(panel.querySelector('#art-btn-search'), () => setupBusca(panel));
        rebind(panel.querySelector('#art-btn-cancel'), () => cancelarBusca(panel));
    }

    /* ==========================================================================
       3. PREPARAÇÃO E MOTOR DE BUSCA
       ========================================================================== */

    async function setupBusca(panel) {
        if (searchState.isRunning) return;
        searchState.isCancelled = false;
        searchState.totalPages = Infinity;
        searchState.totalResults = 0;
        searchState.rmoIdAtual = window.Utils.crea.extrairIdRmo(document) || "";

        if (searchState.mode === 'address') {
            const l = panel.querySelector('#art-inp-logradouro').value.trim();
            const b = panel.querySelector('#art-inp-bairro').value.trim();
            const n = panel.querySelector('#art-inp-numeros').value.trim();
            const p = panel.querySelector('#art-inp-page-addr').value;

            if (!l && !b) { UI.toast.warning("Preencha Logradouro ou Bairro!"); return; }

            searchState.currentPage = parseInt(p) || 1;
            searchState.limitPage = searchState.currentPage + CONFIG.PAGES_INITIAL_LIMIT - 1;
            searchState.logradouro = l;
            searchState.bairro = b;
            searchState.regexList = Utils.text.buildHybridRegex(n);

        } else if (searchState.mode === 'contract') {
            const cnpjRaw = panel.querySelector('#art-inp-cnpj').value.trim();
            const ctrRaw = panel.querySelector('#art-inp-contrato').value.trim();
            const p = panel.querySelector('#art-inp-page-ctr').value;

            if (!cnpjRaw || !ctrRaw) { UI.toast.warning("Preencha CNPJ e Contrato/Ano!"); return; }
            if (ctrRaw.split('/').length !== 2) { UI.toast.warning("Formato inválido. Use CONTRATO/ANO."); return; }

            const cnpjClean = Utils.format.apenasNumeros(cnpjRaw);
            if (cnpjClean.length === 0) { UI.toast.warning("CNPJ inválido."); return; }

            searchState.cnpj = cnpjClean;
            searchState.currentPage = parseInt(p) || 1;
            searchState.limitPage = searchState.currentPage + CONFIG.PAGES_INITIAL_LIMIT - 1;
            searchState.contratoStr = ctrRaw;

            const parts = ctrRaw.split('/');
            const isYear = s => s.length === 4 && (s.startsWith('19') || s.startsWith('20'));
            searchState.contratoAno = isYear(parts[0].trim()) ? parts[0].trim() : parts[1].trim();
            const rawNum = isYear(parts[0].trim()) ? parts[1].trim() : parts[0].trim();
            searchState.contratoNum = parseInt(rawNum, 10).toString();
            searchState.contratoRegex = new RegExp(`(?<!\\d)0*${searchState.contratoNum}(?!\\d)`);

        } else if (searchState.mode === 'document') {
            const docRaw = panel.querySelector('#art-inp-doc-cpfcnpj').value.trim();
            const endRaw = panel.querySelector('#art-inp-doc-endereco').value.trim();
            const p = panel.querySelector('#art-inp-page-doc').value;

            if (!docRaw) { UI.toast.warning("Preencha o CPF ou CNPJ!"); return; }

            const docClean = Utils.format.apenasNumeros(docRaw);
            if (docClean.length !== 11 && docClean.length !== 14) {
                UI.toast.warning("Documento inválido. Deve ter 11 (CPF) ou 14 (CNPJ) dígitos.");
                return;
            }

            searchState.docCpfCnpj = docClean;
            searchState.currentPage = parseInt(p) || 1;
            searchState.limitPage = searchState.currentPage + CONFIG.PAGES_INITIAL_LIMIT - 1;
            searchState.docRegexList = Utils.text.buildHybridRegex(endRaw);
        }

        const container = panel.querySelector('#art-results-container');
        container.innerHTML = '';
        toggleLoadingState(panel, true);
        searchState.isRunning = true;

        await executarLoopVarredura(panel);
    }

    async function executarLoopVarredura(panel) {
        const container = panel.querySelector('#art-results-container');

        try {
            while (!searchState.isCancelled && searchState.currentPage <= searchState.limitPage) {
                const page = searchState.currentPage;
                updateStatusMsg(container, `Analisando pág ${page}...`, 'loading');

                const params = buildParams(page);
                const url = `${CONFIG.API_ART_URL}?${params.toString()}`;
                const response = await window.Comm.apiART.fetchAsync(url);

                if (searchState.isCancelled) break;
                const result = await processPageResult(response.responseText, container);

                if (searchState.totalPages === Infinity) {
                    searchState.totalPages = result.metadados.totalPaginas || 1;
                    searchState.totalResults = result.metadados.totalOcorrencias || 0;
                }

                if (result.metadados.artsNaPagina < 1) {
                    finalizar(panel, `Fim dos registros (Página ${page} vazia).`, "warning");
                    return;
                }

                if (result.matches.length > 0) {
                    UI.toast.success(`${result.matches.length} ARTs encontradas na pág ${page}!`);
                    updateStatusMsg(container, `✅ ${result.matches.length} ARTs na pág ${page}`, 'success', true);

                    result.matches.forEach(m => {
                        container.appendChild(renderCard(m));
                        if(searchState.mode === 'address' || searchState.mode === 'document') requestQueue.add(() => fetchDetailsTask(m.url, m.id));
                    });

                    toggleLoadingState(panel, false);

                    if (page >= searchState.totalPages) finalizar(panel, `Busca concluída! ${searchState.totalPages} págs varridas.`, "success");
                    else addContinueButton(panel, page + 1);

                    searchState.isRunning = false;
                    return;
                }

                if (page >= searchState.totalPages) {
                    finalizar(panel, `Busca concluída! ${searchState.totalPages} págs varridas.`, "success");
                    return;
                }

                searchState.currentPage++;
                await new Promise(r => setTimeout(r, 500));
            }

            if (searchState.currentPage > searchState.limitPage && searchState.currentPage <= searchState.totalPages) {
                finalizar(panel, "Limite de páginas do ciclo atingido.", "warning");
                addContinueButton(panel, searchState.currentPage);
            }

        } catch (error) {
            finalizar(panel, `Erro: ${error.message}`, "error");
        } finally {
            if(searchState.isCancelled) searchState.isRunning = false;
        }
    }

    /* ==========================================================================
       4. PROCESSAMENTO DE REDE
       ========================================================================== */

    function buildParams(pageIndex) {
        const params = new URLSearchParams();
        params.append('TIPO_ART', 'obra_servico');
        params.append('SIT_ART2', 'REGISTRADA');
        params.append('pg', (pageIndex - 1).toString());
        params.append('div', 'tela_principal');

        ['NOME_DO_PROPRIETARIO','NUMERO_ART','NUMERO_ART1025','ANO','CEP','EMPRESA','OBSERVACOES','data_reg_inicio','data_reg_fim']
            .forEach(k => params.append(k, ''));

        if (searchState.mode === 'address') {
            params.append('CIDADE', 'Brasília');
            params.append('DESCRICAO_DO_LOGRADOURO', searchState.logradouro);
            params.append('BAIRRO', searchState.bairro);
            params.append('CPF_CNPJ_PROP_CONT', '');
        } else if (searchState.mode === 'contract') {
            params.append('CIDADE', '');
            params.append('DESCRICAO_DO_LOGRADOURO', '');
            params.append('BAIRRO', '');
            params.append('CPF_CNPJ_PROP_CONT', searchState.cnpj);
        } else if (searchState.mode === 'document') {
            params.append('CIDADE', '');
            params.append('DESCRICAO_DO_LOGRADOURO', '');
            params.append('BAIRRO', '');
            params.append('CPF_CNPJ_PROP_CONT', searchState.docCpfCnpj);
        }
        return params;
    }

   async function processPageResult(html, container) {
        const dadosExtraidos = Utils.crea.parseListaARTs(html);
        const matches = [];

        if (searchState.mode === 'address') {
            dadosExtraidos.arts.forEach((art, idx) => {
                if (Utils.text.checkAll(art.endereco, searchState.regexList)) {
                    matches.push({
                        id: Date.now() + idx,
                        url: searchState.rmoIdAtual ? `${art.urlImpressao}&rmo_id=${searchState.rmoIdAtual}` : art.urlImpressao,
                        artNum: art.numeroART,
                        owner: art.proprietario,
                        address: Utils.text.applyHighlight(art.endereco, searchState.regexList, 'pts-highlight pts-highlight--success'),
                        dataRegistro: art.dataRegistro
                    });
                }
            });
        } else if (searchState.mode === 'contract') {
            updateStatusMsg(container, `Verificando ${dadosExtraidos.arts.length} ARTs detalhadamente...`, 'loading', true);

            for (let i = 0; i < dadosExtraidos.arts.length; i++) {
                if (searchState.isCancelled) break;
                const art = dadosExtraidos.arts[i];
                try {
                    const detailHtml = await window.Comm.apiART.fetchText(art.urlImpressao);
                    const detalhes = Utils.crea.parseDetalheART(detailHtml);

                    const checkResult = Utils.crea.checkContractDeep(detalhes, searchState.contratoAno, searchState.contratoRegex);

                    if (checkResult.match) {
                        const mId = Date.now() + i;
                        artCache[mId] = detalhes;
                        matches.push({
                            id: mId, artNum: art.numeroART, owner: art.proprietario,
                            url: searchState.rmoIdAtual ? `${art.urlImpressao}&rmo_id=${searchState.rmoIdAtual}` : art.urlImpressao,
                            contratanteName: detalhes.contrato.contratante || art.proprietario,
                            address: "Contrato validado internamente.", extraInfo: checkResult.foundText,
                            dataRegistro: art.dataRegistro,
                            docFormatado: detalhes.contrato.documento || detalhes.obra.documento,
                            docLimpo: detalhes.contrato.documentoLimpo || detalhes.obra.documentoLimpo
                        });
                    }
                } catch (e) { console.warn("Erro ao buscar detalhes da ART:", e); }
            }
        } else if (searchState.mode === 'document') {
            dadosExtraidos.arts.forEach((art, idx) => {
                if (Utils.text.checkAll(art.endereco, searchState.docRegexList)) {
                    matches.push({
                        id: Date.now() + idx,
                        url: searchState.rmoIdAtual ? `${art.urlImpressao}&rmo_id=${searchState.rmoIdAtual}` : art.urlImpressao,
                        artNum: art.numeroART,
                        owner: art.proprietario,
                        address: Utils.text.applyHighlight(art.endereco, searchState.docRegexList, 'pts-highlight pts-highlight--success'),
                        dataRegistro: art.dataRegistro
                    });
                }
            });
        }
        return { metadados: dadosExtraidos.metadados, matches };
    }

    /* ==========================================================================
       5. RENDERIZAÇÃO DE COMPONENTES E INTERFACE
       ========================================================================== */

    function renderCard(m) {
        let extraHtml = searchState.mode === 'contract'
            ? T.keyValue("Localizado em:", `<span style="color:var(--th-success)">${m.extraInfo}</span>`)
            : "";

        let headerNameValue = searchState.mode === 'contract' ? (m.contratanteName || m.owner) : '<span style="color:var(--th-text-muted);">⏳...</span>';
        let docHtml = searchState.mode === 'contract' && m.docFormatado ? T.copyableText(m.docFormatado, m.docLimpo, "Copiar dado", "info") : `⏳...`;

        const bodyHtml = `
            ${T.keyValue(searchState.mode === 'contract' ? "Contratante:" : "Proprietário:", headerNameValue, `name-${m.id}`)}
            ${extraHtml}
            ${T.flexRow([
                T.keyValue("Doc:", docHtml, `cpf-${m.id}`),
                T.keyValue("Data:", m.dataRegistro || "N/A")
            ])}
            <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(128, 128, 128, 0.25); display: flex; justify-content: space-between; align-items: flex-end; gap: 8px;">
                <div style="font-size: 13px; color: var(--th-text-muted); line-height: 1.4; flex: 1;">📍 ${m.address}</div>
                ${UI.createIconButton({ icon: 'ℹ', id: `btn-detalhes-${m.id}`, tooltip: 'Ver Detalhes', size: '16px' }).outerHTML}
            </div>
            <div class="detalhes-container" style="display: none; margin-top: 10px; border-top: 1px dashed rgba(128, 128, 128, 0.25); padding-top: 10px;"></div>
        `;

        const card = UI.createCard({ title: m.artNum, html: bodyHtml, variant: 'success', closeButton: true });

        const header = card.querySelector('.pts-card-header');
        const titleSpan = card.querySelector('.pts-card-title');
        if (header && titleSpan) {
            titleSpan.innerHTML = `<a href="${m.url}" target="_blank" class="pts-link art-link-title">${m.artNum}</a>`;

            const btnDownload = UI.createIconButton({
                icon: '📥',
                tooltip: 'Baixar PDF da ART',
                size: '16px'
            });
            btnDownload.classList.add('pts-btn-inline');
            btnDownload.style.marginLeft = '5px';

            btnDownload.onclick = async () => {
                try {
                    btnDownload.innerHTML = ' ⏳';
                    btnDownload.style.pointerEvents = 'none';

                    const rmoIdExtraido = window.Utils.crea.extrairIdRmo(document);

                    if (!rmoIdExtraido) {
                        UI.toast.error("Erro: Não foi possível identificar o ID da RMO nesta tela para o download.");
                        throw new Error("ID da RMO não encontrado.");
                    }

                    await window.Comm.apiLocal.baixarPdfArt(rmoIdExtraido, m.artNum, m.url);

                    UI.toast.success(`Download da ART ${m.artNum} finalizado!`);
                    btnDownload.innerHTML = ' ✅';
                    btnDownload.title = "ART Baixada";

                } catch (e) {
                    btnDownload.innerHTML = ' ❌';
                    if (e.message !== "ID da RMO não encontrado.") {
                        UI.toast.error(`Falha ao baixar ART ${m.artNum}.`);
                    }

                    setTimeout(() => {
                        btnDownload.innerHTML = ' 📥';
                        btnDownload.style.pointerEvents = 'auto';
                    }, 3000);
                }
            };


            const badge = UI.createBadge({ label: "COMPATÍVEL", variant: "success", style: "ghost" });
            badge.style.marginLeft = "10px";

            header.insertBefore(btnDownload, titleSpan.nextSibling);
            header.insertBefore(badge, btnDownload.nextSibling);
        }

        card.querySelectorAll('.pts-copy').forEach(el => {
            el.onclick = () => { navigator.clipboard.writeText(el.dataset.clean); UI.toast.success(`Copiado: ${el.dataset.clean}`); };
        });

        const btnDetalhes = card.querySelector(`#btn-detalhes-${m.id}`);
        btnDetalhes.style.color = 'var(--th-info)';
        const containerDetalhes = card.querySelector('.detalhes-container');
        btnDetalhes.onmouseenter = () => btnDetalhes.style.opacity = "0.7";
        btnDetalhes.onmouseleave = () => btnDetalhes.style.opacity = "1";
        let isLoaded = false; let isExpanded = false;

        btnDetalhes.onclick = async () => {
            if (!isLoaded) {
                try {
                    let detalhes = artCache[m.id];
                    if (!detalhes) {
                        btnDetalhes.innerHTML = `⏳`;
                        const html = await window.Comm.apiART.fetchText(m.url);
                        detalhes = Utils.crea.parseDetalheART(html);
                        artCache[m.id] = detalhes;
                    }

                    // 1. Aba Atividades
                    let ativContent = T.emptyState("Nenhuma atividade técnica registrada.");
                    if (detalhes.atividadesTecnicas && detalhes.atividadesTecnicas.length > 0) {
                        let listHtml = "";
                        detalhes.atividadesTecnicas.forEach((grupo, idx) => {
                            if (grupo && grupo.itens && Array.isArray(grupo.itens)) {
                                listHtml += `<div style="font-weight: bold; margin-bottom: 4px; ${idx > 0 ? 'margin-top: 12px;' : ''}">${grupo.topico}</div>`;
                                listHtml += T.list(grupo.itens.map(i => i.descricao));
                            } else if (typeof grupo === 'string') {
                                listHtml += T.divider(grupo, "solid");
                            }
                        });
                        if (listHtml !== "") ativContent = T.scrollableArea(listHtml);
                    }

                    // 2. Aba Observações
                    let obsContent = T.emptyState("Nenhuma observação registrada.");
                    if (detalhes.observacoes) {
                        obsContent = T.scrollableArea(`<div style="font-weight: bold; margin-bottom: 4px; font-size: 13px;">Observações</div><div>${detalhes.observacoes}</div>`);
                    }

                    const idBtnProf = `btn-env-prof-${m.id}`;
                    const idBtnEmp = `btn-env-emp-${m.id}`;

                    // 3. Aba Responsável
                    let respContent = `
                        <div style="display: flex; justify-content: flex-start; align-items: center; margin-bottom: 4px;">
                            <div style="font-weight: bold; font-size: 13px;">Profissional Responsável</div>
                            ${UI.createIconButton({ icon: '👤', id: idBtnProf, tooltip: 'Adicionar Profissional como Envolvido', size: '16px' }).outerHTML}
                        </div>
                        ${T.keyValue("Nome:", detalhes.responsavel.nome || "N/A")}
                        ${T.keyValue("Título:", detalhes.responsavel.titulo || "N/A")}
                        ${T.keyValue("Registro:", T.copyableText(detalhes.responsavel.registro, Utils.format.apenasNumeros(detalhes.responsavel.registro), "Copiar dado", "info"))}
                        ${T.divider()}

                        <div style="display: flex; justify-content: flex-start; align-items: center; margin-bottom: 4px;">
                            <div style="font-weight: bold; font-size: 13px;">Empresa Contratada</div>
                            ${detalhes.responsavel.empresaContratada && detalhes.responsavel.empresaContratada.nome ?
                                UI.createIconButton({ icon: '🏢', id: idBtnEmp, tooltip: 'Adicionar Empresa como Envolvida', size: '16px' }).outerHTML
                            : ''}
                        </div>
                        ${detalhes.responsavel.empresaContratada && detalhes.responsavel.empresaContratada.nome ? `
                            ${T.keyValue("Nome:", detalhes.responsavel.empresaContratada.nome)}
                            ${T.keyValue("Registro:", T.copyableText(detalhes.responsavel.empresaContratada.registro, Utils.format.apenasNumeros(detalhes.responsavel.empresaContratada.registro), "Copiar dado", "info"))}
                        ` : `<div style="color:var(--th-text-muted); font-size:13px;">Sem empresa vinculada.</div>`}
                    `;

                    // 4. Aba Outros
                    const cepDisplay = detalhes.contrato.cep || (detalhes.obra.endereco && detalhes.obra.endereco.cep) || "N/A";
                    let outrosContent = `
                        <div style="display: flex; justify-content: flex-start; align-items: center; margin-bottom: 4px;">
                             <div style="font-weight: bold; font-size: 13px;">Proprietário da Obra</div>
                             ${UI.createIconButton({ icon: '📌', id: `btn-fill-prop-${m.id}`, tooltip: 'Preencher dados na RMO', size: '16px' }).outerHTML}
                        </div>
                        ${T.keyValue("Nome:", detalhes.obra.proprietario || m.owner || "N/A")}
                        ${T.keyValue("Doc:", T.copyableText(detalhes.obra.documento, detalhes.obra.documentoLimpo, "Copiar dado", "info"))}
                        ${T.divider()}
                        ${T.keyValue("Finalidade:", detalhes.obra.finalidade || "N/A")}
                        ${T.keyValue("CEP:", T.copyableText(cepDisplay, Utils.format.apenasNumeros(cepDisplay), "Copiar dado", "info"))}
                        ${T.divider()}
                        <div style="font-weight: bold; margin-bottom: 4px; font-size: 13px;">ARTs Associadas</div>
                        ${detalhes.artsRelacionadas && detalhes.artsRelacionadas.length > 0 ?
                            T.list(detalhes.artsRelacionadas.map(r => `${r.relacao}: ${T.copyableText(r.numero, Utils.format.apenasNumeros(r.numero), "Copiar dado", "info")}`))
                            : `<div style="color:var(--th-text-muted); font-size:13px;">Nenhuma ART associada.</div>`}
                    `;

                    const tabView1 = document.createElement('div'); tabView1.innerHTML = ativContent;
                    const tabView2 = document.createElement('div'); tabView2.innerHTML = obsContent; tabView2.style.display = 'none';
                    const tabView3 = document.createElement('div'); tabView3.innerHTML = respContent; tabView3.style.display = 'none';
                    const tabView4 = document.createElement('div'); tabView4.innerHTML = outrosContent; tabView4.style.display = 'none';

                    const tabsComponent = UI.createTabs({
                        items: [
                            { label: "Ativ.", active: true, onClick: () => { tabView1.style.display='block'; tabView2.style.display='none'; tabView3.style.display='none'; tabView4.style.display='none'; } },
                            { label: "Obs.", active: false, onClick: () => { tabView1.style.display='none'; tabView2.style.display='block'; tabView3.style.display='none'; tabView4.style.display='none'; } },
                            { label: "Resp.", active: false, onClick: () => { tabView1.style.display='none'; tabView2.style.display='none'; tabView3.style.display='block'; tabView4.style.display='none'; } },
                            { label: "Outros", active: false, onClick: () => { tabView1.style.display='none'; tabView2.style.display='none'; tabView3.style.display='none'; tabView4.style.display='block'; } }
                        ]
                    });

                    containerDetalhes.appendChild(tabsComponent);
                    containerDetalhes.append(tabView1, tabView2, tabView3, tabView4);

                    containerDetalhes.querySelectorAll('.pts-copy').forEach(el => {
                        el.onclick = () => { navigator.clipboard.writeText(el.dataset.clean); UI.toast.success(`Copiado: ${el.dataset.clean}`); };
                    });

                    const btnFillProp = containerDetalhes.querySelector(`#btn-fill-prop-${m.id}`);
                    if (btnFillProp) {
                        btnFillProp.onclick = () => {
                            const isValido = (v) => v && typeof v === 'string' && v.trim() !== "" && v !== "N/A";
                            const payloadProprietario = {};

                            if (isValido(detalhes.obra.proprietario)) payloadProprietario.proprietario = detalhes.obra.proprietario;
                            if (isValido(detalhes.obra.documentoLimpo)) payloadProprietario.cpfCnpj = detalhes.obra.documentoLimpo;
                            if (isValido(detalhes.obra.fone)) payloadProprietario.fone = detalhes.obra.fone;
                            if (isValido(detalhes.obra.email)) payloadProprietario.email = detalhes.obra.email;

                            if (Object.keys(payloadProprietario).length > 0) {
                                const sucesso = window.Utils.rmo.setDadosRmo({ proprietario: payloadProprietario });

                                if (sucesso) {
                                    UI.toast.success("📌 Dados do proprietário injetados na RMO!");
                                } else {
                                    UI.toast.error("Falha ao injetar. A tela da RMO está aberta?");
                                }
                            } else {
                                UI.toast.warning("A ART não possui dados válidos de Proprietário para preencher.");
                            }
                        };
                    }

                    const btnEnvProf = containerDetalhes.querySelector(`#${idBtnProf}`);
                    const btnEnvEmp = containerDetalhes.querySelector(`#${idBtnEmp}`);

                    const gerarObsAtividades = () => {
                        let linhas = [];
                        if (detalhes.atividadesTecnicas && detalhes.atividadesTecnicas.length > 0) {
                            detalhes.atividadesTecnicas.forEach(grupo => {
                                if (grupo && grupo.topico && grupo.itens) {
                                    linhas.push(`[${grupo.topico.toUpperCase()}]`);
                                    grupo.itens.forEach(item => linhas.push(`• ${item.descricao}`));
                                    linhas.push("");
                                }
                            });
                        }
                        return linhas.join('\n').trim();
                    };

                    const handleAddEnvolvido = (btnElement, nome, registro, titulo) => {
                        if (!btnElement) return;
                        btnElement.onclick = () => {
                            const payload = {
                                nome: nome || "N/A",
                                registro: registro || "",
                                art: window.Utils.format.apenasNumeros(m.artNum),
                                regularizacao: "30684",
                                observacoes: gerarObsAtividades(),
                                titulo_profissional: titulo || ""
                            };

                            const sucesso = window.Utils.rmo.adicionarEnvolvido(payload, 'nome');

                            if (sucesso) {
                                UI.toast.success(`Buscando dados no CREA para: ${payload.registro || payload.nome}`);
                            } else {
                                UI.toast.error("Falha ao injetar. A tela da RMO está aberta?");
                            }
                        };
                    };

                    handleAddEnvolvido(btnEnvProf, detalhes.responsavel.nome, detalhes.responsavel.registro, detalhes.responsavel.titulo);

                    if (detalhes.responsavel.empresaContratada && detalhes.responsavel.empresaContratada.nome) {
                        handleAddEnvolvido(btnEnvEmp, detalhes.responsavel.empresaContratada.nome, detalhes.responsavel.empresaContratada.registro, "");
                    }

                    isLoaded = true;
                } catch (e) {
                    btnDetalhes.innerHTML = `❌`;
                    setTimeout(() => { btnDetalhes.innerHTML = `ℹ`; }, 2000);
                    return;
                }
            }

            isExpanded = !isExpanded;
            containerDetalhes.style.display = isExpanded ? 'block' : 'none';
            btnDetalhes.innerHTML = isExpanded ? `▲` : `ℹ`;
        };

        return card;
    }

    /* ==========================================================================
       6. UTILITÁRIOS GERAIS DE UI DO SCRIPT
       ========================================================================== */

    function toggleLoadingState(panel, isLoading) {
        panel.querySelector('#art-btn-search').style.display = isLoading ? 'none' : 'flex';
        panel.querySelector('#art-btn-cancel').style.display = isLoading ? 'flex' : 'none';

        const inputsEAbasPrincipais = Array.from(panel.querySelectorAll('input')).concat(
            Array.from(panel.querySelectorAll('.pts-panel-body > .pts-tabs-container .pts-tab'))
        );

        inputsEAbasPrincipais.forEach(el => {
            if (isLoading) { el.classList.add('input-locked'); if (el.tagName === 'INPUT') el.disabled = true; }
            else { el.classList.remove('input-locked'); if (el.tagName === 'INPUT') el.disabled = false; }
        });
    }

    function updateStatusMsg(container, text, type, replace = true) {
        if (replace || type === 'loading') {
            container.querySelectorAll('.pts-status-box--loading, .pts-status-box--warning').forEach(el => el.remove());
        }
        const h = `<div class="pts-status-box pts-status-box--${type}">${text}</div>`;

        if (type === 'loading') {
            container.insertAdjacentHTML('afterbegin', h);
            if (container.querySelectorAll('.pts-card').length > 0) {
                container.insertAdjacentHTML('beforeend', h);
            }
        } else {
            container.insertAdjacentHTML('beforeend', h);
        }
    }

    function finalizar(panel, msg, type) {
        toggleLoadingState(panel, false);
        updateStatusMsg(panel.querySelector('#art-results-container'), msg, type, true);
        searchState.isRunning = false;
    }

    function addContinueButton(panel, nextPage) {
        const c = panel.querySelector('#art-results-container');
        const old = c.querySelector('#art-btn-continue'); if(old) old.remove();

        const btn = document.createElement('button');
        btn.id = 'art-btn-continue';
        btn.className = 'pts-btn pts-btn--ghost pts-btn--full';
        btn.style.marginTop = "10px";

        const totalStr = (searchState.totalPages !== Infinity && searchState.totalPages > 0) ? ` de ${searchState.totalPages}` : '';
        btn.innerHTML = `🔄 Continuar (Pág ${nextPage}${totalStr})`;

        btn.onclick = () => {
            btn.remove();
            searchState.currentPage = nextPage;
            searchState.limitPage = nextPage + CONFIG.PAGES_INCREMENT - 1;
            searchState.isRunning = true;
            toggleLoadingState(panel, true);
            executarLoopVarredura(panel);
        };
        c.appendChild(btn);
    }

    function cancelarBusca(panel) {
        searchState.isCancelled = true;
        searchState.isRunning = false;
        UI.toast.error("Busca cancelada.");
        toggleLoadingState(panel, false);

       const container = panel.querySelector('#art-results-container');
        if (container) {
            container.querySelectorAll('.pts-status-box--loading').forEach(el => el.remove());

            updateStatusMsg(container, "Busca interrompida pelo usuário.", "error", false);

            setTimeout(() => {
                const avisosErro = container.querySelectorAll('.pts-status-box--error');
                avisosErro.forEach(el => {
                    if (el.innerText === "Busca interrompida pelo usuário.") {
                        el.style.transition = "opacity 0.3s ease";
                        el.style.opacity = "0";
                        setTimeout(() => el.remove(), 300);
                    }
                });
            }, 4000);
        }
    }

    function rebind(el, fn) { if(el) { const n = el.cloneNode(true); el.parentNode.replaceChild(n, el); n.onclick = fn; } }

    function extractPageData() {
        const g = n => { const e = document.querySelector(`input[formcontrolname="${n}"]`); return e ? e.value : ""; };
        const nums = (`${g('endereco')} ${g('numeroEnd')} ${g('complemento')}`).match(/\d+/g);
        return { logradouro: g('endereco')||"", bairro:"", numeros: nums?[...new Set(nums)].join(", "):"" };
    }

    /* ==========================================================================
       7. TAREFAS DE BACKGROUND (Lazy Load)
       ========================================================================== */

    async function fetchDetailsTask(url, id) {
        try {
            const h = await window.Comm.apiART.fetchText(url);
            const detalhes = Utils.crea.parseDetalheART(h);
            artCache[id] = detalhes;

            const docFormatado = detalhes.contrato.documento || detalhes.obra.documento;
            const docLimpo = detalhes.contrato.documentoLimpo || detalhes.obra.documentoLimpo;
            const nomeExibicao = detalhes.contrato.contratante || detalhes.obra.proprietario || "N/A";

            const elDoc = document.getElementById(`cpf-${id}`);
            if (elDoc) {
                elDoc.innerHTML = docFormatado ? T.copyableText(docFormatado, docLimpo, "Copiar dado", "info") : "N/D";
                const spanClick = elDoc.querySelector('.pts-copy');
                if(spanClick) spanClick.onclick = () => { navigator.clipboard.writeText(docLimpo); UI.toast.success(`Copiado: ${docLimpo}`); };
            }

            const elName = document.getElementById(`name-${id}`);
            if (elName) {
                elName.innerHTML = nomeExibicao;
                if (elName.previousElementSibling && elName.previousElementSibling.classList.contains('pts-kv-label')) {
                    elName.previousElementSibling.innerText = "Contratante:";
                }
            }
        } catch(e) {
            console.warn("Erro no Lazy Load de Detalhes:", e);
        }
    }
})();