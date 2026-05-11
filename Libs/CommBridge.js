// ==UserScript==
// @name         Communication Bridge (HTTP API & ART - OOP)
// @namespace    https://github.com/P0NT4S/
// @version      5.2.0
// @description  Camada de comunicação refatorada para Classes ES6 (Padrão SaaS). Integração limpa e Injeção de Dependência nativa.
// @author       P0nt4s
// @grant        GM_xmlhttpRequest
// ==/UserScript==

/**
 * @class CreaAPI
 * @description Especialista em se comunicar com os servidores oficiais do CREA.
 * Lida com contorno de CORS e enfileiramento de requisições para evitar rate-limits.
 */
class CreaAPI {
    constructor(bridge) {
        this.bridge = bridge; // Referência à classe pai (CommBridge) para acessar configs e logs
        this._tokenCache = null; // Cache do token Basic Auth em memória
        this._iniciarSniffer(); // Inicia interceptação passiva de segurança
    }

    /**
     * Intercepta requisições nativas do portal para capturar o header Authorization em tempo real.
     * @private
     */
    _iniciarSniffer() {
        const self = this;
        const originalOpen = XMLHttpRequest.prototype.open;
        const originalSetHeader = XMLHttpRequest.prototype.setRequestHeader;

        XMLHttpRequest.prototype.setRequestHeader = function(header, value) {
            if (header.toLowerCase() === 'authorization' && value.startsWith('Basic ')) {
                if (!self._tokenCache) {
                    self._tokenCache = value;
                    self.bridge.log.success("CreaAPI", "Credenciais interceptadas em tempo real (Sniffer).");
                }
            }
            return originalSetHeader.apply(this, arguments);
        };
    }

    /**
     * Tenta extrair o token de autenticação do banco de dados IndexedDB do Ionic (_ionickv).
     * @private
     * @returns {Promise<string|null>} O token formatado em "Basic Om..." ou null.
     */
    async _extrairTokenDoIndexedDB() {
        if (this._tokenCache) return this._tokenCache;

        // Fallback 1: Local Storage (Mais rápido, mas menos provável no Ionic)
        const tokenLocal = localStorage.getItem('token') || localStorage.getItem('auth_token');
        if (tokenLocal) {
            this._tokenCache = tokenLocal.startsWith('Basic ') ? tokenLocal : "Basic " + btoa(":" + tokenLocal);
            this.bridge.log.info("CreaAPI", "Credenciais recuperadas via LocalStorage.");
            return this._tokenCache;
        }

        return new Promise((resolve) => {
            try {
                // Tenta abrir o banco de dados específico do Ionic/CREA
                const request = indexedDB.open("_ionickv");

                request.onerror = () => {
                    this.bridge.log.warning("CreaAPI", "Falha ao abrir IndexedDB _ionickv. Usando apenas fallbacks básicos.");
                    resolve(null);
                };

                request.onsuccess = (event) => {
                    const db = event.target.result;
                    if (!db.objectStoreNames.contains("keyvaluepairs")) {
                        db.close();
                        return resolve(null);
                    }

                    const transaction = db.transaction(["keyvaluepairs"], "readonly");
                    const store = transaction.objectStore("keyvaluepairs");
                    const getRequest = store.get("token");

                    getRequest.onsuccess = () => {
                        const tokenPuro = getRequest.result;
                        if (tokenPuro && typeof tokenPuro === 'string') {
                            // A mágica: Adiciona o ":" e converte para Base64 (Padrão Basic Auth do Portal)
                            this._tokenCache = "Basic " + btoa(":" + tokenPuro);
                            this.bridge.log.success("CreaAPI", "Credenciais extraídas do banco _ionickv com sucesso.");
                            resolve(this._tokenCache);
                        } else {
                            resolve(null);
                        }
                        db.close();
                    };

                    getRequest.onerror = () => {
                        db.close();
                        resolve(null);
                    };
                };
            } catch (e) {
                this.bridge.log.error("CreaAPI", "Erro catastrófico ao acessar IndexedDB.", e);
                resolve(null);
            }
        });
    }

    /**
     * Faz uma requisição HTTP assíncrona burlando o CORS usando a API do Tampermonkey.
     */
    async fetchAsync(url = this.bridge.urlBaseArt, metodo = "GET", dados = null, headers = {}) {
        // Se for uma URL do CREA, tenta injetar o token de autorização automaticamente
        if (url.includes('creadf.org.br')) {
            const token = await this._extrairTokenDoIndexedDB();
            if (token && !headers['Authorization']) {
                headers['Authorization'] = token;
            }
        }

        return new Promise((resolve, reject) => {
            if (typeof GM_xmlhttpRequest === "undefined") {
                this.bridge.log.error("CreaAPI", "GM_xmlhttpRequest não definido. Falta @grant no cabeçalho?");
                return reject(new Error("GM_xmlhttpRequest ausente."));
            }
            
            // Headers refinados para máxima compatibilidade e evitar 403
            const headersPadrao = {
                'User-Agent': navigator.userAgent,
                'Accept': 'application/json, text/plain, */*',
                'X-Requested-With': 'XMLHttpRequest'
            };

            // Para URLs do Mobile, o Referer é obrigatório e validado pelo servidor
            if (url.includes('mobile.creadf.org.br')) {
                headersPadrao['Referer'] = 'https://mobile.creadf.org.br/sgf_web_21/www/';
            }

            const opcoes = {
                method: metodo,
                url: url,
                headers: { ...headersPadrao, ...headers },
                onload: r => {
                    if (r.status >= 200 && r.status < 300) {
                        resolve(r);
                    } else {
                        const error = new Error(`HTTP ${r.status}`);
                        error.response = r; // Anexa a resposta para análise posterior (ex: parse do body de erro)
                        reject(error);
                    }
                },
                onerror: (e) => reject(new Error("Falha na conexão de rede.")),
                ontimeout: () => reject(new Error("Tempo de requisição esgotado."))
            };

            if (dados) {
                if (headers['Content-Type'] === 'application/x-www-form-urlencoded') {
                    opcoes.data = dados;
                } else {
                    opcoes.data = typeof dados === 'string' ? dados : JSON.stringify(dados);
                }
            }
            
            GM_xmlhttpRequest(opcoes);
        });
    }

    /**
     * Atalho prático para buscar apenas o texto/HTML de uma página.
     */
    async fetchText(url = this.bridge.urlBaseArt, metodo = "GET", dados = null, headers = {}) {
        const r = await this.fetchAsync(url, metodo, dados, headers);
        return r.responseText;
    }

    /**
     * Busca dados no Portal Corporativo (API Mobile).
     * @param {string} campo - 'registro', 'cpf_cnpj' ou 'nome'.
     * @param {string} valor - O valor a ser pesquisado.
     */
    async buscarCorporativo(campo, valor) {
        const url = `https://mobile.creadf.org.br/sgf_web_21/ws/busca_corp?campo=${campo}&valor=${encodeURIComponent(valor)}`;
        const res = await this.fetchAsync(url, "GET");
        
        try {
            return JSON.parse(res.responseText);
        } catch (e) {
            this.bridge.log.error("CreaAPI", "Falha ao processar JSON corporativo.", res.responseText.substring(0, 200));
            throw new Error("O servidor corporativo não retornou um formato JSON válido.");
        }
    }

    /**
     * Gera a requisição de impressão de uma ART.
     * @param {string} numeroArt - Número da ART (13 dígitos).
     */
    async gerarImpressaoArt(numeroArt) {
        const url = 'https://art.creadf.org.br/art1025/funcoes/form_impressao_tos.php';
        const payload = `rnp_ficha_intranet=1&NUMERO_DA_ART=${numeroArt}&envia=Consultar ART`;
        const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
        
        return await this.fetchAsync(url, "POST", payload, headers);
    }

    /**
     * Fábrica de Filas (Queues) para impedir o bloqueio por excesso de requisições.
     */
    createQueue(maxConcurrent = 3) {
        return {
            items: [],
            active: 0,
            max: maxConcurrent,
            add: function(taskFn) {
                this.items.push(taskFn);
                this.next();
            },
            next: function() {
                if (this.active >= this.max || !this.items.length) return;
                const taskFn = this.items.shift();
                this.active++;
                taskFn().finally(() => {
                    this.active--;
                    this.next();
                });
            }
        };
    }

    // =========================================================================
    // GERENCIAMENTO DE SESSÃO (ART e Corporativo)
    // =========================================================================

    /**
     * Verifica se a sessão no portal de ARTs está ativa.
     * Faz um GET na área protegida e inspeciona a URL final após redirecionamentos.
     * @returns {Promise<boolean>}
     */
    verificarSessaoArt() {
        return new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: 'https://art.creadf.org.br/art1025/publico/consultas.php',
                headers: { 'Referer': 'https://art.creadf.org.br/' },
                onload: (r) => {
                    const ativa = !r.finalUrl.includes('login');
                    this.bridge.log.info('CreaAPI', `Sessão ART: ${ativa ? 'ATIVA' : 'INATIVA'} (→ ${r.finalUrl})`);
                    resolve(ativa);
                },
                onerror: () => resolve(false)
            });
        });
    }

    /**
     * Autentica no portal de ARTs via HTTP POST direto ao endpoint de autenticação.
     * @param {string} usuario
     * @param {string} senha
     * @returns {Promise<boolean>} true se o login foi bem-sucedido.
     */
    logarArt(usuario, senha) {
        const payload = [
            `username=${encodeURIComponent(usuario)}`,
            `password=${encodeURIComponent(senha)}`,
            `action=%2Fart1025%2Fpublico%2Fconsultas.php`
        ].join('&');

        return new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: 'POST',
                url: 'https://art.creadf.org.br/auth/authenticate.php',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Referer': 'https://art.creadf.org.br/login.php'
                },
                data: payload,
                onload: (r) => {
                    const sucesso = !r.finalUrl.includes('login');
                    this.bridge.log.info('CreaAPI', `Login ART: ${sucesso ? 'SUCESSO' : 'FALHOU'} (→ ${r.finalUrl})`);
                    resolve(sucesso);
                },
                onerror: () => resolve(false)
            });
        });
    }

    /**
     * Verifica se a sessão no portal Corporativo está ativa.
     * Inspeciona a URL final e a presença do link de logout na resposta.
     * @returns {Promise<boolean>}
     */
    verificarSessaoCorp() {
        return new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: 'https://corp.creadf.org.br/pessoa',
                onload: (r) => {
                    // Logado = não foi redirecionado pro login E a página contém o link de logout
                    const ativa = !r.finalUrl.includes('login') && r.responseText.includes('logout');
                    this.bridge.log.info('CreaAPI', `Sessão Corporativo: ${ativa ? 'ATIVA' : 'INATIVA'}`);
                    resolve(ativa);
                },
                onerror: () => resolve(false)
            });
        });
    }

    /**
     * Autentica no portal Corporativo.
     * Passo 1: GET na página de login para extrair o token CSRF (campo _token).
     * Passo 2: POST ao endpoint /autentica com o token e as credenciais.
     * @param {string} usuario
     * @param {string} senha
     * @returns {Promise<boolean>} true se o login foi bem-sucedido.
     */
    async logarCorp(usuario, senha) {
        // O CSRF token muda a cada carregamento da página de login — precisa ser extraído em tempo real
        let token;
        try {
            const paginaLogin = await this.fetchText('https://corp.creadf.org.br/login');
            const match = paginaLogin.match(/name="_token"\s+value="([^"]+)"/);
            if (!match) {
                this.bridge.log.error('CreaAPI', 'Token CSRF não encontrado na página de login do Corporativo.');
                return false;
            }
            token = match[1];
        } catch (e) {
            this.bridge.log.error('CreaAPI', 'Falha ao buscar token CSRF do Corporativo.', e);
            return false;
        }

        const payload = [
            `_token=${encodeURIComponent(token)}`,
            `sistema=CORP`,
            `username=${encodeURIComponent(usuario)}`,
            `password=${encodeURIComponent(senha)}`
        ].join('&');

        return new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: 'POST',
                url: 'https://corp.creadf.org.br/autentica',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Referer': 'https://corp.creadf.org.br/login'
                },
                data: payload,
                onload: (r) => {
                    const sucesso = !r.finalUrl.includes('login');
                    this.bridge.log.info('CreaAPI', `Login Corporativo: ${sucesso ? 'SUCESSO' : 'FALHOU'} (→ ${r.finalUrl})`);
                    resolve(sucesso);
                },
                onerror: () => resolve(false)
            });
        });
    }
}

/**
 * @class LocalAPI
 * @description Especialista em se comunicar com o seu Backend (FastAPI/Python).
 */
class LocalAPI {
    constructor(bridge) {
        this.bridge = bridge;
    }

    /**
     * Motor interno padronizado para a API Local.
     * @private
     */
    _fazerRequisicao(metodo, endpoint, dados = null, ignorar404 = false) {
        const url = `${this.bridge.config.API_LOCAL_URL}${endpoint}`;
        const logContext = "CommAPILocal";
        
        return new Promise((resolve, reject) => {
            const opcoes = {
                method: metodo,
                url: url,
                headers: dados ? this.bridge.config.HEADERS_PADRAO : {},
                onload: (resposta) => {
                    if (resposta.status === 404 && ignorar404) {
                        this.bridge.log.info(logContext, `Recurso não encontrado (404): ${endpoint}`);
                        return resolve(null);
                    }

                    if (resposta.status < 200 || resposta.status >= 300) {
                        let msg = `Erro no servidor (Status ${resposta.status})`;
                        try {
                            const erroJson = JSON.parse(resposta.responseText);
                            if (erroJson && erroJson.detail) {
                                msg = Array.isArray(erroJson.detail) 
                                    ? "Dados inválidos: " + erroJson.detail.map(e => e.msg).join(", ") 
                                    : erroJson.detail; 
                            }
                        } catch (e) {
                            this.bridge.log.warning(logContext, "O erro do backend não é um JSON válido.", resposta.responseText);
                        }

                        this.bridge.log.error(logContext, `Erro [${metodo}] ${endpoint}`, { status: resposta.status, msg: msg });
                        return reject(new Error(msg));
                    }

                    try {
                        const json = JSON.parse(resposta.responseText);
                        this.bridge.log.success(logContext, `Sucesso [${metodo}] ${endpoint}`);
                        resolve(json);
                    } catch (e) {
                        this.bridge.log.error(logContext, "Falha ao processar JSON.", e);
                        reject(new Error("Falha ao processar resposta JSON."));
                    }
                },
                onerror: (erro) => {
                    this.bridge.log.error(logContext, `Falha de rede [${metodo}] ${endpoint}`, erro);
                    if (this.bridge.ui) this.bridge.ui.error("Falha de comunicação com o servidor local.");
                    reject(new Error("NetworkError"));
                }
            };

            if (dados) opcoes.data = JSON.stringify(dados);
            GM_xmlhttpRequest(opcoes);
        });
    }

    async consultarRmo(idRmo) {
        return await this._fazerRequisicao('GET', `/api/consultar/${idRmo}`, null, true);
    }

    async processarRmo(dadosRmo) {
        const statusPermitidos = ["Regular", "Irregular", "Informações Insuficientes"];
        if (!statusPermitidos.includes(dadosRmo.status)) {
            const msgErro = `Status recusado pelo client: '${dadosRmo.status}'.`;
            this.bridge.log.error("CommAPILocal", msgErro, { statusEnviado: dadosRmo.status });
            if (this.bridge.ui) this.bridge.ui.warning(`Status "${dadosRmo.status}" não é aceito.`);
            throw new Error(msgErro);
        }
        return await this._fazerRequisicao('POST', '/api/processar', dadosRmo);
    }

    async consultarLoteRmos(ids) {
        return await this._fazerRequisicao('POST', '/api/consultar_lote', { ids_rmo: ids });
    }

    async listarRmosVerificadas() {
        return await this._fazerRequisicao('GET', '/api/listar_verificados');
    }

    async baixarPdfArt(idRmo, numeroArt, urlArt) {
        const payload = { id_rmo: idRmo, numero_art: numeroArt, url_art: urlArt };
        return await this._fazerRequisicao('POST', '/api/baixar_art', payload);
    }
}

/**
 * @class PublicAPI
 * @description Especialista em consumir APIs públicas externas (ex: BrasilAPI).
 */
class PublicAPI {
    constructor(bridge) {
        this.bridge = bridge;
    }

    /**
     * Consulta dados de um CNPJ na BrasilAPI.
     * @param {string} cnpj - CNPJ apenas números.
     */
    async consultarCnpj(cnpj) {
        // A BrasilAPI exige CNPJ apenas numérico (sem pontos, barras ou hifens)
        const cnpjLimpo = cnpj.replace(/\D/g, '');
        const url = `https://brasilapi.com.br/api/cnpj/v1/${cnpjLimpo}`;
        try {
            const res = await this.bridge.apiART.fetchAsync(url);
            return JSON.parse(res.responseText);
        } catch (e) {
            // Tenta extrair a mensagem de erro estruturada da BrasilAPI (400, 404, etc)
            if (e.response && e.response.responseText) {
                try {
                    const errorData = JSON.parse(e.response.responseText);
                    this.bridge.log.warning("PublicAPI", `BrasilAPI: ${errorData.message || errorData.type}`);
                    return { error: true, ...errorData };
                } catch (parseErr) {
                    // Se não for JSON, segue para o erro genérico
                }
            }
            this.bridge.log.error("PublicAPI", `Falha ao consultar CNPJ ${cnpj}`, e);
            throw e;
        }
    }
}

/**
 * @class Login
 * @description Gerencia a rotina de autenticação em páginas do CREA que exigem login
 * antes de permitir buscas ou requisições. Opera diretamente sobre o DOM da página
 * hospedeira, por isso os seletores são configuráveis para se adaptar a diferentes
 * estruturas de formulário.
 *
 * @example
 *   const login = bridge.criarLogin({
 *     seletorCampoLogin: '#usuario',
 *     seletorCampoSenha: '#senha',
 *     seletorBotaoSubmit: 'button.btn-entrar',
 *     aguardarMsAposLogin: 3000
 *   });
 *   await login.logarComCredenciais('meu_usuario', 'minha_senha');
 */
class Login {
    /**
     * @param {CommBridge} bridge - Instância do CommBridge (para acesso ao sistema de log).
     * @param {object} [config={}] - Configurações dos seletores e comportamento.
     * @param {string} [config.seletorCampoLogin='input[type="text"]'] - Seletor CSS do campo de usuário.
     * @param {string} [config.seletorCampoSenha='input[type="password"]'] - Seletor CSS do campo de senha.
     * @param {string} [config.seletorBotaoSubmit='button[type="submit"]'] - Seletor CSS do botão de envio.
     * @param {number} [config.aguardarMsAposLogin=2000] - Tempo de espera (ms) após o clique no botão,
     *                                                     para aguardar redirecionamento ou resposta da SPA.
     */
    constructor(bridge, config = {}) {
        this.bridge = bridge;

        // Centraliza os seletores configurando defaults razoáveis como fallback
        this.config = {
            seletorCampoLogin:   config.seletorCampoLogin  || 'input[type="text"]',
            seletorCampoSenha:   config.seletorCampoSenha  || 'input[type="password"]',
            seletorBotaoSubmit:  config.seletorBotaoSubmit || 'button[type="submit"]',
            aguardarMsAposLogin: config.aguardarMsAposLogin ?? 2000
        };
    }

    /**
     * Submete o formulário de login usando as credenciais já preenchidas
     * pelo mecanismo de autopreenchimento do próprio navegador.
     * Útil quando o browser já salvou as credenciais e as injeta automaticamente
     * ao carregar a página — o script apenas aciona o botão de submit.
     *
     * @returns {Promise<void>} Resolve após o tempo configurado em `aguardarMsAposLogin`.
     * @throws {Error} Se o botão de submit não for encontrado.
     */
    async logarComAutopreenchimento() {
        const botao = document.querySelector(this.config.seletorBotaoSubmit);
        if (!botao) {
            throw new Error(`[Login] Botão de submit não encontrado com seletor: "${this.config.seletorBotaoSubmit}"`);
        }

        this.bridge.log.info('Login', 'Submetendo formulário via autopreenchimento do navegador...');
        botao.click();
        await this._aguardar(this.config.aguardarMsAposLogin);
    }

    /**
     * Preenche os campos de login e senha programaticamente e submete o formulário.
     * Dispara eventos nativos (`input`, `change`) para garantir compatibilidade com
     * frameworks reativos como Ionic/Angular que ignoram atribuição direta de `.value`.
     *
     * @param {string} login - Identificador do usuário (CPF, matrícula, e-mail, etc.).
     * @param {string} senha - Senha do usuário.
     * @returns {Promise<void>} Resolve após o tempo configurado em `aguardarMsAposLogin`.
     * @throws {Error} Se qualquer um dos elementos do formulário não for encontrado.
     */
    async logarComCredenciais(login, senha) {
        const campoLogin = document.querySelector(this.config.seletorCampoLogin);
        const campoSenha = document.querySelector(this.config.seletorCampoSenha);
        const botao      = document.querySelector(this.config.seletorBotaoSubmit);

        if (!campoLogin) throw new Error(`[Login] Campo de login não encontrado: "${this.config.seletorCampoLogin}"`);
        if (!campoSenha) throw new Error(`[Login] Campo de senha não encontrado: "${this.config.seletorCampoSenha}"`);
        if (!botao)      throw new Error(`[Login] Botão de submit não encontrado: "${this.config.seletorBotaoSubmit}"`);

        this._preencherCampo(campoLogin, login);
        this._preencherCampo(campoSenha, senha);

        this.bridge.log.info('Login', 'Credenciais injetadas. Submetendo formulário...');
        botao.click();
        await this._aguardar(this.config.aguardarMsAposLogin);
    }

    /**
     * Preenche um campo de input simulando interação real do usuário.
     * Usa o setter nativo do HTMLInputElement para forçar o reconhecimento
     * pelo modelo de dados do framework (Angular/Ionic não reagem a `.value = x`).
     *
     * @private
     * @param {HTMLInputElement} campo - O elemento input a ser preenchido.
     * @param {string} valor - O valor a ser inserido.
     */
    _preencherCampo(campo, valor) {
        // A atribuição direta de `.value` não dispara o ciclo de detecção de mudanças
        // do Angular/Ionic. O setter nativo + disparo de eventos resolve isso.
        const setterNativo = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setterNativo.call(campo, valor);
        campo.dispatchEvent(new Event('input',  { bubbles: true }));
        campo.dispatchEvent(new Event('change', { bubbles: true }));
    }

    /**
     * Aguarda um intervalo de tempo antes de continuar o fluxo.
     * @private
     * @param {number} ms - Milissegundos a aguardar.
     * @returns {Promise<void>}
     */
    _aguardar(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

/**
 * @class CommBridge
 * @description O Ponto de Entrada (Facade) da camada de rede.
 * Instancia os submódulos de comunicação (CREA e Backend Local) injetando as dependências.
 */
class CommBridge {
    /**
     * @param {CoreUtils} coreUtils - Instância obrigatória para o sistema de Logs.
     * @param {UIFacade} [uiFacade=null] - Instância opcional para disparar Toasts visuais em caso de erro de rede.
     */
    constructor(coreUtils, uiFacade = null) {
        if (!coreUtils) throw new Error("[CommBridge] Erro Fatal: CoreUtils é obrigatório.");
        
        this.core = coreUtils;
        this.log = coreUtils.log;
        this.ui = uiFacade;

        // Configurações de Rede e Ambiente
        this.config = {
            MODO_TESTE: false,
            API_LOCAL_URL: 'http://127.0.0.1:6969',
            URLS_ART: {
                PRODUCAO: 'https://art.creadf.org.br/art1025/publico/consultas_ret.php',
                TESTE: 'http://localhost:8989'
            },
            HEADERS_PADRAO: { 'Content-Type': 'application/json' }
        };

        // Instancia os submódulos passando o escopo atual (this)
        this.apiART = new CreaAPI(this);
        this.apiLocal = new LocalAPI(this);
        this.apiPublica = new PublicAPI(this);
    }

    /**
     * Alterna o direcionamento das URLs da API do CREA.
     */
    definirModoTeste(status) {
        this.config.MODO_TESTE = !!status;
        this.log.warning("CommBridge", `Ambiente alterado. Modo de Teste: ${this.config.MODO_TESTE}`);
    }

    /**
     * Retorna a URL base do CREA dinamicamente.
     */
    get urlBaseArt() {
        return this.config.MODO_TESTE ? this.config.URLS_ART.TESTE : this.config.URLS_ART.PRODUCAO;
    }

    /**
     * Factory method que instancia e retorna uma rotina de Login configurada para a página atual.
     * @param {object} [config={}] - Seletores e comportamento. Veja a classe `Login` para detalhes.
     * @param {string} [config.seletorCampoLogin] - Seletor CSS do campo de usuário.
     * @param {string} [config.seletorCampoSenha] - Seletor CSS do campo de senha.
     * @param {string} [config.seletorBotaoSubmit] - Seletor CSS do botão de envio.
     * @param {number} [config.aguardarMsAposLogin] - Tempo de espera (ms) após o submit.
     * @returns {Login}
     * @example
     *   const login = bridge.criarLogin({ seletorCampoLogin: '#cpf', seletorBotaoSubmit: '.btn-ok' });
     *   await login.logarComCredenciais('00000000000', 'senha123');
     */
    criarLogin(config = {}) {
        return new Login(this, config);
    }
}