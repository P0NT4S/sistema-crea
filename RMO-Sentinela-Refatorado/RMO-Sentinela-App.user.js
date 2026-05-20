// ==UserScript==
// @name         RMO Sentinela (V2 - Arquitetura POO)
// @namespace    https://github.com/P0NT4S/
// @version      4.0.0
// @description  Vigia a tabela de RMOs, consulta lote via API (FastAPI) e aplica feedback visual (Cores e Tooltips) com arquitetura POO/MVC.
// @author       P0nt4s
// @match        https://mobile.creadf.org.br/sgf_web_21/cea_rmo_list.php*
// @updateURL    https://raw.githubusercontent.com/P0NT4S/sistema-crea/main/RMO-Sentinela-Refatorado/RMO-Sentinela-App.user.js
// @downloadURL  https://raw.githubusercontent.com/P0NT4S/sistema-crea/main/RMO-Sentinela-Refatorado/RMO-Sentinela-App.user.js
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_getResourceText
// @require      https://raw.githubusercontent.com/P0NT4S/sistema-crea/main/Libs/UIFactory.js
// @require      https://raw.githubusercontent.com/P0NT4S/sistema-crea/main/Libs/Utils.js
// @require      https://raw.githubusercontent.com/P0NT4S/sistema-crea/main/Libs/CommBridge.js
// @require      https://raw.githubusercontent.com/P0NT4S/sistema-crea/main/RMO-Sentinela-Refatorado/RMO-Sentinela-Domain.js
// @require      https://raw.githubusercontent.com/P0NT4S/sistema-crea/main/RMO-Sentinela-Refatorado/RMO-Sentinela-Service.js
// @require      https://raw.githubusercontent.com/P0NT4S/sistema-crea/main/RMO-Sentinela-Refatorado/RMO-Sentinela-GUI.js
// @require      https://raw.githubusercontent.com/P0NT4S/sistema-crea/main/RMO-Sentinela-Refatorado/RMO-Sentinela-Controller.js
// @resource     P0nt4sTheme https://raw.githubusercontent.com/P0NT4S/sistema-crea/main/Libs/P0nt4sTheme.css
// ==/UserScript==

(function() {
    'use strict';

    /* ==========================================================================
       INJEÇÃO DO DESIGN SYSTEM (P0nt4sTheme)
       ========================================================================== */
    const themeCss = typeof GM_getResourceText !== 'undefined' ? GM_getResourceText('P0nt4sTheme') : '';

    if (typeof GM_addStyle !== 'undefined') {
        GM_addStyle(themeCss);
    } else {
        const styleEl = document.createElement('style');
        styleEl.textContent = themeCss;
        document.head.appendChild(styleEl);
    }

    /* ==============================
       CONFIGURAÇÕES DO SCRIPT
       ============================== */
    const CONFIG = {
        seletorLinha: "table tr"
    };

    /* ==========================================================================
       BOOTSTRAP (STARTUP POINT)
       ========================================================================== */
    let inicializado = false;

    /**
     * Instancia as dependências em ordem de acoplamento e delega para o Controller.
     */
    function iniciarApp() {
        if (inicializado) return;

        // Verificação de segurança: garante o carregamento de todas as bibliotecas no escopo global
        if (typeof CoreUtils === 'undefined' || typeof UIFacade === 'undefined' || typeof CommBridge === 'undefined') {
            console.error('[RmoSentinela] Erro Crítico: Uma ou mais Libs não foram carregadas. Verifique os @require.');
            return;
        }

        // Instanciação das dependências compartilhadas
        const appUtils = new CoreUtils({ logName: 'RmoSentinela' });
        const appUIFactory = new UIFacade(appUtils);
        const appCommBridge = new CommBridge(appUtils, appUIFactory);

        inicializado = true;
        appUtils.log.success('App', 'Injeção de dependências POO concluída.');
 
        // Força a utilização do tema claro para se integrar perfeitamente ao layout claro do CREA
        document.documentElement.setAttribute('data-theme', 'light');
        if (typeof ThemeManager !== 'undefined') {
            ThemeManager.init();
        }

        // Pacote de dependências do Controller
        const dependencias = {
            UIFactory: appUIFactory,
            Utils: appUtils,
            CommBridge: appCommBridge,
            seletorLinha: CONFIG.seletorLinha
        };

        try {
            const mainController = new RmoSentinelaController(dependencias);
            mainController.inicializar();
        } catch (erro) {
            console.error('[RmoSentinela] Falha ao inicializar o RmoSentinelaController:', erro);
        }
    }

    // Ouvintes de ciclo de vida para SPAs ou carregamentos síncronos tradicionais
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        iniciarApp();
    } else {
        window.addEventListener('DOMContentLoaded', iniciarApp);
        window.addEventListener('load', iniciarApp);
    }

})();
