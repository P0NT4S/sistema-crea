/* ==========================================================================
   MÓDULO DE SERVIÇOS (Service Layer)
   Responsabilidade: Orquestrar toda comunicação com APIs externas e extrair
   dados do contexto da página. Não possui conhecimento de UI nem de regras de
   negócio — essas pertencem ao Domain e à GUI, respectivamente.
   ========================================================================== */

/**
 * @class RmoRegistradorService
 * @description Centraliza as operações de I/O do script de Registro de RMOs.
 * Recebe as dependências de rede via injeção de construtor, garantindo baixo
 * acoplamento e facilitando testes isolados.
 *
 * @example
 * const servico = new RmoRegistradorService(commBridge, coreUtils);
 * const idRmo = servico.extrairIdRmoDaPagina(creaHelper);
 * const dados  = await servico.consultarRmo(idRmo);
 * await servico.salvarRmo(payload);
 */
class RmoRegistradorService {
    /**
     * @param {CommBridge} commBridge - Instância da camada de rede.
     * @param {CoreUtils}  coreUtils  - Instância do núcleo de utilitários (log).
     */
    constructor(commBridge, coreUtils) {
        if (!commBridge) throw new Error('[RmoRegistradorService] CommBridge é obrigatório.');
        if (!coreUtils)  throw new Error('[RmoRegistradorService] CoreUtils é obrigatório.');

        this._comm = commBridge;
        this._log  = coreUtils.log;
    }

    // ========================================================================
    // EXTRAÇÃO DE CONTEXTO DA PÁGINA
    // ========================================================================

    /**
     * Extrai o número da RMO do contexto da página.
     * A classe RmoInterceptor já gerencia o tempo de hidratação do Angular através
     * de retries internos.
     *
     * @param {CreaHelper} creaHelper - Instância já inicializada do CreaHelper.
     * @returns {Promise<string|null>} O número da RMO ou null se não localizado.
     */
    async extrairIdRmoDaPagina(creaHelper) {
        const dadosGerais = await creaHelper.rmo.getDadosRmo('geral');
        
        if (dadosGerais && dadosGerais.numero) {
            const numeroStr = String(dadosGerais.numero);
            this._log.success('RmoService', `Número extraído via Angular State: ${numeroStr}`);
            return numeroStr;
        }

        return null;
    }

    // ========================================================================
    // COMUNICAÇÃO COM A API LOCAL (Backend)
    // ========================================================================

    /**
     * Consulta os dados de uma RMO já registrada no backend local.
     * Retorna null se a RMO ainda não existir (HTTP 404) — situação esperada e tratada.
     *
     * @param {string} idRmo - ID numérico da RMO a consultar.
     * @returns {Promise<{ fiscal: string, status: string, descricao: string }|null>}
     */
    async consultarRmo(idRmo) {
        this._log.primary('RmoService', `Consultando RMO ${idRmo} em background...`);
        try {
            // apiLocal.consultarRmo já trata 404 retornando null (ignorar404=true)
            const dados = await this._comm.apiLocal.consultarRmo(idRmo);
            if (dados) {
                this._log.success('RmoService', 'Dados da RMO recebidos do servidor.');
            } else {
                this._log.info('RmoService', 'RMO ainda não registrada (retorno null do servidor).');
            }
            return dados;
        } catch (erro) {
            // Erros de rede ou servidor (5xx) — propaga para o Controller tratar
            this._log.error('RmoService', 'Falha ao consultar RMO.', erro);
            throw erro;
        }
    }

    /**
     * Submete um payload de registro/atualização de RMO ao backend local.
     * A validação do payload é responsabilidade do Domain (RmoRegistroModel.estaValido).
     * O CommBridge já realiza a validação de status permitidos antes de enviar.
     *
     * @param {{ id_rmo: string, status: string, descricao: string, rts: Object }} payload
     *   DTO serializado via PayloadRegistroRmo.serializar().
     * @returns {Promise<Object>} Resposta JSON do servidor.
     * @throws {Error} Se o servidor retornar erro ou a rede falhar.
     */
    async salvarRmo(payload) {
        this._log.primary('RmoService', 'Submetendo payload para processamento...', payload);
        try {
            const resposta = await this._comm.apiLocal.processarRmo(payload);
            this._log.success('RmoService', 'RMO processada com sucesso pelo servidor.');
            return resposta;
        } catch (erro) {
            this._log.error('RmoService', 'Falha ao salvar RMO.', erro);
            throw erro;
        }
    }

    /**
     * Injeta a descrição no campo de observações da RMO na página atual
     * e aciona o salvamento nativo do sistema do CREA.
     * @param {CreaHelper} creaHelper - Instância para acesso à RMO nativa.
     * @param {string} descricao - Texto a ser concatenado.
     */
    /**
     * Obtém a observação atual da RMO cadastrada na página do CREA.
     * @param {CreaHelper} creaHelper
     * @returns {Promise<string>}
     */
    async obterObservacaoDaPagina(creaHelper) {
        try {
            const abaOutros = await creaHelper.rmo.getDadosRmo('outros');
            return abaOutros?.observacoes || "";
        } catch (erro) {
            this._log.error('RmoService', 'Erro ao obter observações da página:', erro);
            return "";
        }
    }

    /**
     * Gera o novo texto de observação, inserindo o demarcador "§" no início
     * ou substituindo a descrição registrada anteriormente se ela já contiver "§".
     *
     * @param {string} obsAtuais - Observações atuais da RMO no sistema.
     * @param {string} novaDescricao - Descrição a ser salva.
     * @returns {string} O novo texto de observações montado.
     * @private
     */
    _gerarNovaObservacao(obsAtuais, novaDescricao) {
        const obsLimpa = (obsAtuais || "").trim();
        const marcador = '§';
        const indicePrefixo = obsLimpa.indexOf(marcador);

        if (indicePrefixo !== -1) {
            // Se já tem o demarcador, extrai tudo que vem antes (preservando texto manual) e atualiza
            const textoAnterior = obsLimpa.substring(0, indicePrefixo);
            return `${textoAnterior}${marcador} ${novaDescricao.trim()}`;
        } else {
            // Se não tem o demarcador, concatena no final precedido de "§ "
            const separador = obsLimpa ? '\n\n' : '';
            return `${obsLimpa}${separador}${marcador} ${novaDescricao.trim()}`;
        }
    }

    /**
     * Injeta a descrição no campo de observações da RMO na página atual
     * e aciona o salvamento nativo do sistema do CREA.
     * @param {CreaHelper} creaHelper - Instância para acesso à RMO nativa.
     * @param {string} descricao - Texto a ser concatenado.
     */
    async salvarNaPagina(creaHelper, descricao) {
        if (!descricao || descricao.trim() === '') return false;

        this._log.primary('RmoService', 'Injetando descrição nas observações e acionando salvar nativo...');
        try {
            const abaOutros = await creaHelper.rmo.getDadosRmo('outros');
            if (!abaOutros) {
                this._log.warning('RmoService', 'Não foi possível obter a aba "outros" do Angular.');
                return false;
            }

            const obsAtuais = abaOutros.observacoes || "";
            const novaObs = this._gerarNovaObservacao(obsAtuais, descricao);
            
            // Evita atualizar à toa se a observação for idêntica
            if (obsAtuais === novaObs) {
                this._log.info('RmoService', 'A observação na página já está idêntica. Apenas salvando...');
            } else {
                const injetou = creaHelper.rmo.setDadosRmo({ outros: { observacoes: novaObs } });
                if (!injetou) {
                    this._log.error('RmoService', 'Falha ao injetar as novas observações no Angular.');
                    return false;
                }
            }

            const salvo = await creaHelper.rmo.salvarRMO();
            if (salvo) {
                this._log.success('RmoService', 'RMO salva no sistema nativo com sucesso.');
                return true;
            } else {
                this._log.error('RmoService', 'Falha ao acionar o salvamento nativo.');
                return false;
            }
        } catch (erro) {
            this._log.error('RmoService', 'Exceção ao salvar na página.', erro);
            throw erro;
        }
    }

    /**
     * Injeta a descrição, aciona o envio nativo e abre a página de movimentações.
     * @param {CreaHelper} creaHelper - Instância para acesso à RMO nativa.
     * @param {string} descricao - Texto a ser concatenado.
     * @param {string} idRmo - Número da RMO para busca.
     */
    async enviarEArquivarNaPagina(creaHelper, descricao, idRmo) {
        if (!descricao || descricao.trim() === '') return false;

        this._log.primary('RmoService', 'Injetando descrição nas observações e acionando envio nativo...');
        try {
            const abaOutros = await creaHelper.rmo.getDadosRmo('outros');
            if (!abaOutros) {
                this._log.warning('RmoService', 'Não foi possível obter a aba "outros" do Angular.');
                return false;
            }

            const obsAtuais = abaOutros.observacoes || "";
            const novaObs = this._gerarNovaObservacao(obsAtuais, descricao);

            // Evita atualizar à toa se a observação for idêntica
            if (obsAtuais === novaObs) {
                this._log.info('RmoService', 'A observação na página já está idêntica. Apenas enviando...');
            } else {
                const injetou = creaHelper.rmo.setDadosRmo({ outros: { observacoes: novaObs } });
                if (!injetou) {
                    this._log.error('RmoService', 'Falha ao injetar as novas observações no Angular.');
                    return false;
                }
            }

            const enviado = await creaHelper.rmo.enviarRMO();
            if (!enviado) {
                this._log.error('RmoService', 'Falha ao acionar o envio nativo.');
                throw new Error('Falha ao enviar a RMO no sistema nativo.');
            }

            this._log.success('RmoService', 'RMO enviada no sistema nativo com sucesso. Iniciando verificação...');

            // Garante que a sessão no SGF esteja ativa antes de consultar
            let sessaoAtiva = await this._comm.apiART.verificarSessaoMovimentacao();
            if (!sessaoAtiva) {
                this._log.warning('RmoService', 'Sessão do SGF inativa. Tentando aquecer sessão automaticamente...');
                sessaoAtiva = await this._comm.apiART.aquecerSessaoMovimentacao();
                if (!sessaoAtiva) {
                    this._log.warning('RmoService', 'Não foi possível reativar a sessão do SGF automaticamente.');
                } else {
                    this._log.success('RmoService', 'Sessão do SGF aquecida e ativa.');
                }
            }

            // Verificação em até 5 tentativas (a cada 1s) para compensar o delay do sistema
            const urlBusca = `https://sgf.creadf.org.br/admin/documento/buscar?documento=${idRmo}`;
            const maxTentativas = 5;
            const intervaloMs = 1000;

            for (let tentativa = 1; tentativa <= maxTentativas; tentativa++) {
                this._log.info('RmoService', `Consultando página de movimentações... Tentativa ${tentativa}/${maxTentativas}`);
                
                let htmlResp;
                try {
                    htmlResp = await this._comm.apiART.fetchText(urlBusca, "GET");
                } catch (erroBusca) {
                    // Se der erro de autenticação (HTTP 401), tentamos realizar o aquecimento em tempo real e re-executar
                    if (erroBusca.message && erroBusca.message.includes('401')) {
                        this._log.warning('RmoService', 'Sessão expirou ou retornou 401 durante a busca. Tentando re-aquecer a sessão...');
                        const aquecida = await this._comm.apiART.aquecerSessaoMovimentacao();
                        if (aquecida) {
                            htmlResp = await this._comm.apiART.fetchText(urlBusca, "GET");
                        } else {
                            throw erroBusca;
                        }
                    } else {
                        throw erroBusca;
                    }
                }

                if (htmlResp.includes("Nenhum documento encontrado.")) {
                    if (tentativa === maxTentativas) {
                        this._log.error('RmoService', 'Falha no arquivamento: Documento não encontrado nas movimentações.');
                        throw new Error('O envio falhou: Documento não encontrado nas movimentações.');
                    }
                } else {
                    // Achou, vamos buscar o link
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(htmlResp, 'text/html');
                    
                    const botoes = Array.from(doc.querySelectorAll('a.btn.btn-primary'));
                    const botaoAbrir = botoes.find(btn => btn.textContent.includes('Abrir') && btn.href.includes('/editar'));

                    if (botaoAbrir) {
                        let urlEditar = botaoAbrir.getAttribute('href');
                        if (urlEditar.startsWith('/')) {
                            urlEditar = 'https://sgf.creadf.org.br' + urlEditar;
                        }
                        
                        this._log.success('RmoService', `Link de edição encontrado: ${urlEditar}`);
                        
                        if (typeof GM_openInTab !== 'undefined') {
                            GM_openInTab(urlEditar, { active: false });
                        } else {
                            window.open(urlEditar, '_blank');
                        }
                        return true;
                    } else {
                        if (tentativa === maxTentativas) {
                            this._log.warning('RmoService', 'Botão de "Abrir" não encontrado no HTML da busca.');
                            return false;
                        }
                    }
                }

                // Aguarda 1s se não for a última tentativa
                if (tentativa < maxTentativas) {
                    await new Promise(r => setTimeout(r, intervaloMs));
                }
            }
            
            return false;
        } catch (erro) {
            this._log.error('RmoService', 'Exceção ao enviar e arquivar na página.', erro);
            throw erro;
        }
    }
}
