// ==UserScript==
// @name         RMO Sentinela (v3.3)
// @namespace    http://tampermonkey.net/
// @version      3.3
// @description  Vigia a tabela de RMOs, consulta lote via API (FastAPI) e aplica feedback visual (Cores e Tooltips).
// @author       P0nt4s
// @match        https://mobile.creadf.org.br/sgf_web_21/cea_rmo_list.php*
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
        seletorLinha: "table tr",
        iconeBotao: '🔄', // Ícone alterado para remeter a Reload
        coresStatus: {
            "Regular": "rgba(16, 185, 129, 0.2)",                   // Verde
            "Irregular": "rgba(239, 68, 68, 0.2)",                  // Vermelho
            "Informações Insuficientes": "rgba(251, 191, 36, 0.2)"  // Amarelo
        }
    };

    const UI = window.UIFactory;
    const Log = window.Utils.log;

    let executando = false;
    let inicializado = false;

    // --- INICIALIZAÇÃO ROBUSTA ---
    function iniciarApp() {
        if (inicializado) return;
        inicializado = true;

        Log.init("RMOSentinela");

        if (UI && UI.createFab) {
            UI.createFab(CONFIG.iconeBotao, vigiarTabela, "Sincronizar RMOs");
        } else {
            Log.error("RMOSentinela", "UIFactory não carregado. Verifique os @require.");
            return;
        }

        setTimeout(() => {
            Log.info("RMOSentinela", "Iniciando varredura automática...");
            vigiarTabela();
        }, 1500);
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        iniciarApp();
    } else {
        window.addEventListener('DOMContentLoaded', iniciarApp);
    }

    // --- FUNÇÃO PRINCIPAL ---
    async function vigiarTabela() {
        if (executando) return;
        executando = true;

        Log.primary("Varredura", "Coletando IDs da tabela...");

        const mapaRmos = {};
        const idsParaConsultar = [];
        const linhas = document.querySelectorAll(CONFIG.seletorLinha);

        linhas.forEach(linha => {
            if (linha.cells.length < 2) return;

            const textoLinha = linha.innerText;
            const matchId = textoLinha.match(/\d{4}[A-Z]{3}\d{4}/);

            if (matchId) {
                const id = matchId[0];

                if (!mapaRmos[id]) {
                    mapaRmos[id] = [];
                    idsParaConsultar.push(id);
                }

                mapaRmos[id].push(linha);
                linha.dataset.rmoId = id;
            }
        });

        if (idsParaConsultar.length === 0) {
            Log.warning("Varredura", "Nenhum ID de RMO encontrado na tabela.");
            executando = false;
            return;
        }

        Log.info("Varredura", `Encontrados ${idsParaConsultar.length} IDs únicos. Consultando API...`);

        try {
            // CORREÇÃO: Utilizando o namespace correto da apiLocal do CommBridge atualizado
            const resposta = await window.Comm.apiLocal.consultarLoteRmos(idsParaConsultar);

            const resultadosObjeto = resposta.resultados || {};

            const resultadosFormatados = Object.entries(resultadosObjeto).map(([id, dados]) => {
                return {
                    id_rmo: id,
                    status: dados.status,
                    descricao: dados.descricao
                };
            });

            Log.success("API", `Recebidos ${resultadosFormatados.length} resultados válidos do servidor.`);

            if (UI.toast) {
                UI.toast.info(`Recebidos ${resultadosFormatados.length} resultados do servidor.`);
            }

            aplicarMudancasVisuais(resultadosFormatados, mapaRmos);

        } catch (erro) {
            Log.error("API", "Falha ao consultar lote", erro);
            if(UI.toast) UI.toast.error("Falha ao comunicar com o servidor RMO.");
        } finally {
            executando = false;
        }
    }

    // --- ATUALIZAÇÃO VISUAL ---
    function aplicarMudancasVisuais(resultados, mapaRmos) {
        if (!Array.isArray(resultados)) return;

        let contadorAtualizados = 0;

        resultados.forEach(item => {
            const linhasAssociadas = mapaRmos[item.id_rmo];
            if (!linhasAssociadas) return;

            linhasAssociadas.forEach(linha => {
                const corFundo = CONFIG.coresStatus[item.status];
                if (corFundo) {
                    linha.style.backgroundColor = corFundo;
                    contadorAtualizados++;
                }

                // Posicionamento exato na coluna de Status (Índice 1) baseada no HTML fornecido
                const celulaStatus = linha.cells[1];

                if (celulaStatus) {
                    // Verifica se não há ícone nativo (img) e se ainda não colocamos o nosso (span)
                    const temIconeNativo = celulaStatus.querySelector('img') !== null;
                    const temNossoIcone = celulaStatus.querySelector('.rmo-tooltip-icon') !== null;

                    if (!temIconeNativo && !temNossoIcone) {
                        const iconeTooltip = document.createElement('span');
                        iconeTooltip.innerText = 'ℹ';
                        iconeTooltip.className = 'rmo-tooltip-icon';
                        iconeTooltip.style.cursor = 'help';
                        iconeTooltip.style.fontSize = '16px';
                        iconeTooltip.title = item.descricao || "Sem descrição informada.";

                        celulaStatus.appendChild(iconeTooltip);
                    }
                }
            });
        });

        Log.success("Visual", `Tabela atualizada: ${contadorAtualizados} RMOs coloridas.`);

        if (UI.toast && contadorAtualizados > 0) {
            UI.toast.success(`Sentinela: ${contadorAtualizados} RMOs sincronizadas!`);
        }
    }

})();