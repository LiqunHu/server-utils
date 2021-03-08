const _ = require('lodash')
const elasticsearch = require('elasticsearch')
let client = null

const initElasticsearch = cfg => {
    client = new elasticsearch.Client(cfg)
}

const getClient = () => {
  return client
}

module.exports = {
  initElasticsearch: initElasticsearch,
  getClient: getClient
}
