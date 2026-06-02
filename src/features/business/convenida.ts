export const body = {
  cnpj: "11111111111111", // CNPJ without mask
  //"cnpjCanalWL": "22222222222222",
  //"cnpjOrigem": "",
  /*
  CNPJ_CPF/EXTERNAL_ID/NOME_OPERACAO/EMAIL/CPF/Nome da pessoa
    */
  identificadorCliente: "51802678468",
  //"urlCallback": "https://www.google.com",
  razaoSocial: "EMPRESA TESTE LTDA",
  nomeFantasia: "EMPRESA TESTE",
  cnae: "4679-6/01",
  ramoAtividade: "LANCHONETES, CASAS DE CHA, DE SUCOS E SIMILARES",
  faturamentoPrevisto: 10000, // TODO
  email: "empresateste@gmail.com",
  dddComercial: "83",
  telefoneComercial: "999114785",
  cep: "58690000",
  logradouro: "Rua Rita Pereira De Almeida",
  numeroEndereco: 173,
  //"complemento": "Em Cima Do Mercadinho Popular",
  bairro: "Centro",
  municipio: "Livramento",
  uf: "PB",
  dddCel: "83",
  telefoneCelular: "83",
  responsavelAssinatura: "Responsavel Legal", // Nome da pessoa
  quantidadePos: 1,
  faturamentoContratado: 10000, // TODO
  antecipacaoAutomatica: "S", // TODO
  taxaAntecipacao: 0, // TODO
  tipoAntecipacao: "ROTATIVO", // TODO
  mcc: "5814",
  tipoContrato: "W", // TODO
  codConfiguracao: "", // DEPRECATED, return ""
  cnpjParceiro: "11111111111111",
  idCesta: 834, // TODO
  tarifacao: [
    // TODO, think id Is id cesta (?)
    {
      id: 118687,
      valor: 0,
    },
    {
      id: 118730,
      valor: 3.82,
    },
    {
      id: 118688,
      valor: 3.22,
    },
    {
      id: 118709,
      valor: 3.22,
    },
    {
      id: 118731,
      valor: 4.59,
    },
  ],
  codBanco: "001",
  agencia: "906",
  digAgencia: "09",
  numConta: "785985",
  digConta: "9",
  protocoloCore: " ", // Only for re-submission
  hashAceite: "X", // Deprecated, return ""
  terminais: [], // ?
  documentosSocios: [
    // TODO
    {
      identificacao: "51802678468",
      anexos: [
        {
          nomeArquivo: "semAnexo.jpg",
          conteudo: "EM BRANCO",
          tipo: "BRANCO",
        },
      ],
    },
  ],
  anexos: [
    // TODO
    {
      nomeArquivo: "semAnexo.jpg",
      conteudo: "EM BRANCO",
      tipo: "BRANCO",
    },
  ],
  //"outrosMeiosCaptura": [
  //	{
  //		"meioCaptura": "ECOMMERCE"
  //	}
  //]
};
