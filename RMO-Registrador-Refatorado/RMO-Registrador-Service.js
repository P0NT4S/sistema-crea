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
}
