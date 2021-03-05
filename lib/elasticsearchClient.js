const _ = require('lodash')
const elasticsearch = require('elasticsearch')
let client = null

const initElasticsearch = cfg => {
  if (!_.isEmpty(cfg)) {
    let conPata = {
      host: cfg.host,
      log: cfg.log
    }
    if(cfg.auth) {
      conPata.auth = cfg.auth
    }
    if(cfg.protocol) {
      conPata.protocol = cfg.protocol
    }
    client = new elasticsearch.Client(conPata)
  }
}

const getClient = () => {
  return client
}

module.exports = {
  initElasticsearch: initElasticsearch,
  getClient: getClient
}
