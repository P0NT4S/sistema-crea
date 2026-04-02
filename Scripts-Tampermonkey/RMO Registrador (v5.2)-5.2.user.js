// ==UserScript==
// @name         RMO Registrador (v5.2)
// @namespace    http://tampermonkey.net/
// @version      5.2
// @description  Painel de Upsert de RMOs. Delegação de extração para Utils, FAB em modo toggle e API atualizada.
// @author       P0nt4s
// @match        https://mobile.creadf.org.br/sgf_web_21/www/*
// @grant        GM_xmlhttpRequest
// @require      https://gist.githubusercontent.com/MarcosMiguelSMachado/a5d808f84366ed6169fc4ffd73e9f0ae/raw/ThemeCore.js
// @require      https://gist.githubusercontent.com/MarcosMiguelSMachado/6a99a28dea832506c7dbcfe819bece45/raw/UIFactory.js
// @require      https://gist.githubusercontent.com/MarcosMiguelSMachado/99893c72883edfe67435a4464136dc1e/raw/Utils.js
// @require      https://gist.githubusercontent.com/MarcosMiguelSMachado/9786c95596cfcc5193e6a90c9cad1609/raw/CommBridge.js
// ==/UserScript==

(function() {
    'use strict';

    /* ==============================
       CONFIGURAÇÕES DO SCRIPT
       ============================== */
    const CONFIG = {
        painelId: 'rmo-crud-panel',
        seletorBuscaDom: 'input[name="cod_rmo"], input[type="hidden"], td.td_title',
        tempoEsperaDom: 1000 // ms máximos aguardando o render inicial
    };

    // Aliases para as bibliotecas injetadas
    const UI = window.UIFactory;
    const Log = window.Utils.log;

    // Estado central da aplicação
    const Estado = {
        idRmo: null,
        fiscal: '---',
        statusRmo: 'Desconhecido',
        descricao: ''
    };

    let appIniciado = false;

    /* ==========================================================================
       1. INICIALIZAÇÃO E COORDENAÇÃO
       ========================================================================== */
    async function iniciarApp() {
        if (appIniciado) return;
        appIniciado = true;

        Log.init("RMORegistrador");
        Log.primary("Core", "Aguardando DOM e delegando busca de ID para Utils...");

        // Aguarda um elemento base para garantir que a página não está em branco
        await window.Utils.dom.waitFor(CONFIG.seletorBuscaDom, CONFIG.tempoEsperaDom);

        // DELEGAÇÃO: Chama o extrator centralizado no Utils
        if (window.Utils.crea && window.Utils.crea.extrairIdRmo) {
            Estado.idRmo = window.Utils.crea.extrairIdRmo(document);
        } else {
            Log.error("Core", "Módulo Utils.crea.extrairIdRmo não encontrado. Atualize o Utils.js.");
            return;
        }

        if (Estado.idRmo) {
            Log.success("Core", `RMO identificada com sucesso: ${Estado.idRmo}`);

            // Cria o FAB como Toggle (Corrigida a ordem dos parâmetros do UIFactory)
            const fab = UI.createFab('💾', "Registrar/Editar RMO", null, togglePainelRegistro);
            fab.style.background = 'var(--th-success)';

            // Fetch silencioso
            consultarDadosAutomaticamente();
        } else {
            Log.warning("Core", "Nenhum ID de RMO encontrado nesta tela.");
        }
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        iniciarApp();
    } else {
        window.addEventListener('DOMContentLoaded', iniciarApp);
    }

    /* ==========================================================================
       2. COMUNICAÇÃO (BACKGROUND FETCH)
       ========================================================================== */
    async function consultarDadosAutomaticamente() {
        try {
            Log.primary("API", `Consultando ${Estado.idRmo} em background...`);

            // CORREÇÃO: Utilizando o namespace correto da apiLocal do CommBridge
            const dados = await window.Comm.apiLocal.consultarRmo(Estado.idRmo);

            if (dados) {
                Estado.fiscal = dados.fiscal || '---';
                Estado.statusRmo = dados.status;
                Estado.descricao = dados.descricao || '';
                Log.success("API", "State atualizado com dados do servidor.");
            } else {
                Estado.statusRmo = 'Nova (Não Registrada)';
                Log.info("API", "RMO inédita, formulário pronto para inserção.");
            }
        } catch (e) {
            Estado.statusRmo = 'Erro de Conexão';
            Log.error("API", "Falha no fetch inicial.", e);
        }
    }

    /* ==========================================================================
       3. INTERFACE E LÓGICA DO PAINEL DE CRUD
       ========================================================================== */
    /**
     * Alterna a visibilidade do painel. Se não existir, constrói.
     */
    function togglePainelRegistro() {
        const painelExistente = document.getElementById(CONFIG.painelId);

        if (painelExistente) {
            if (painelExistente.style.display === 'none') {
                painelExistente.style.display = 'flex';
            } else {
                painelExistente.style.display = 'none';
            }
        } else {
            construirPainelRegistro();
        }
    }

    /**
     * Monta o painel de registro na primeira vez que o FAB é clicado.
     */
    function construirPainelRegistro() {

        const painel = UI.createPanel({
            id: CONFIG.painelId,
            title: "📝 Registrar RMO",
            width: "400px",
            persist: true, // Importante: Impede a destruição do DOM ao clicar no X do painel
            html: `
                <div class="my-group">
                    <label class="my-label">ID da RMO</label>
                    <input type="text" id="crud-id" class="my-input" value="${Estado.idRmo}" readonly style="background: var(--th-bg-dark); cursor: not-allowed; opacity: 0.8;">
                </div>

                <div class="my-group">
                    <label class="my-label">Status da Fiscalização</label>
                    <select id="crud-status" class="my-input">
                        <option value="" disabled ${!Estado.statusRmo || Estado.statusRmo === 'Nova (Não Registrada)' ? 'selected' : ''}>Selecione um status...</option>
                        <option value="Regular" ${Estado.statusRmo === 'Regular' ? 'selected' : ''}>Regular</option>
                        <option value="Irregular" ${Estado.statusRmo === 'Irregular' ? 'selected' : ''}>Irregular</option>
                        <option value="Informações Insuficientes" ${Estado.statusRmo === 'Informações Insuficientes' ? 'selected' : ''}>Informações Insuficientes</option>
                    </select>
                </div>

                <div class="my-group">
                    <label class="my-label">Descrição da Matéria-Prima</label>
                    <textarea id="crud-desc" class="my-input" rows="4" placeholder="Detalhes da fiscalização..." style="resize: vertical;">${Estado.descricao}</textarea>
                </div>

                <div style="border-top: 1px solid var(--th-bg-light); margin-top: 15px; padding-top: 15px; display: flex; justify-content: flex-end;">
                    <button id="crud-btn-salvar" class="my-btn my-btn--primary" style="width: 100%;" disabled>Salvar Registro</button>
                </div>
            `
        });

        // Binds
        const selectStatus = painel.querySelector('#crud-status');
        const inputDesc = painel.querySelector('#crud-desc');
        const btnSalvar = painel.querySelector('#crud-btn-salvar');

        // Validação reativa
        const validarFormulario = () => {
            const status = selectStatus.value;
            const desc = inputDesc.value.trim();

            let valido = false;
            if (status === 'Regular' || status === 'Informações Insuficientes') {
                valido = true;
            } else if (status === 'Irregular' && desc !== '') {
                valido = true;
            }

            btnSalvar.disabled = !valido;
            btnSalvar.style.opacity = valido ? '1' : '0.5';
            btnSalvar.style.cursor = valido ? 'pointer' : 'not-allowed';
        };

        selectStatus.addEventListener('change', validarFormulario);
        inputDesc.addEventListener('input', validarFormulario);
        validarFormulario();

        // Ação de Salvar
        btnSalvar.onclick = async () => {
            const payload = {
                id_rmo: Estado.idRmo,
                status: selectStatus.value,
                descricao: inputDesc.value.trim(),
                rts: {} // Mantido conforme sua lógica original
            };

            const textoOriginal = btnSalvar.innerText;
            btnSalvar.innerText = "Salvando...";
            btnSalvar.disabled = true;

            try {
                // CORREÇÃO: Utilizando o namespace correto da apiLocal
                await window.Comm.apiLocal.processarRmo(payload);

                UI.toast.success("RMO registrada com sucesso!");
                Log.success("CRUD", "Registro processado via CommBridge.", payload);

                Estado.statusRmo = payload.status;
                Estado.descricao = payload.descricao;

                // Apenas oculta o painel após sucesso
                painel.style.display = 'none';

            } catch (erro) {
                UI.toast.error("Falha ao salvar. Verifique o console.");
            } finally {
                btnSalvar.innerText = textoOriginal;
                validarFormulario();
            }
        };
    }

})();