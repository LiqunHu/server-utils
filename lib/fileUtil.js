const _ = require('lodash')
const fs = require('fs')
const path = require('path')
const multiparty = require('multiparty')
const uuid = require('uuid')
const moment = require('moment')
const mime = require('mime-types')
const qiniu = require('qiniu')
const OSS = require('ali-oss')

const mongoClient = require('./mongoClient')

let logger = console
let config = null
let aliclient = null

const setLogger = appointLogger => {
  logger = appointLogger.createLogger(__filename)
}

const initQiniu = cfg => {
  if (!_.isEmpty(cfg)) {
    //需要填写你的 Access Key 和 Secret Key
    config = cfg
  }
}

const fileSaveLocal = (req, svpath, urlbase) => {
  return new Promise((resolve, reject) => {
    if (req.is('multipart/*')) {
      try {
        if (!fs.existsSync(svpath)) {
          let result = fs.mkdirSync(svpath, { recursive: true })
          if (result) {
            reject(result)
          }
        }
        let uploadOptions = {
          autoFields: true,
          autoFiles: true,
          uploadDir: svpath,
          maxFileSize: 10 * 1024 * 1024
        }
        let form = new multiparty.Form(uploadOptions)
        form.parse(req, (err, fields, files) => {
          if (err) {
            reject(err)
          }
          if (files.file) {
            logger.debug(files.file[0].path)
            resolve({
              name: files.file[0].originalFilename,
              ext: path.extname(files.file[0].path),
              url: urlbase + path.basename(files.file[0].path),
              type: mime.lookup(path.extname(files.file[0].path)),
              path: files.file[0].path
            })
          } else {
            reject('no file')
          }
        })
      } catch (error) {
        reject(error)
      }
    } else {
      reject('content-type error')
    }
  })
}

const fileSaveQiniu = (req, tempDir, bucket, urlbase) => {
  return new Promise((resolve, reject) => {
    if (req.is('multipart/*')) {
      try {
        if (!fs.existsSync(tempDir)) {
          let result = fs.mkdirSync(tempDir, { recursive: true })
          if (result) {
            reject(result)
          }
        }
        let uploadOptions = {
          autoFields: true,
          autoFiles: true,
          uploadDir: tempDir,
          maxFileSize: 10 * 1024 * 1024
        }
        let form = new multiparty.Form(uploadOptions)
        form.parse(req, (err, fields, files) => {
          if (err) {
            reject(err)
          }
          if (files.file) {
            logger.debug(files.file[0].path)
            let mac = new qiniu.auth.digest.Mac(config.accessKey, config.secretKey)
            let options = {
              scope: bucket
            }
            let putPolicy = new qiniu.rs.PutPolicy(options)

            let uploadToken = putPolicy.uploadToken(mac)
            let cfg = new qiniu.conf.Config()
            let formUploader = new qiniu.form_up.FormUploader(cfg)
            let putExtra = new qiniu.form_up.PutExtra()
            let filename = moment().format('YYYY/MM/DD/') + uuid.v1().replace(/-/g, '') + path.extname(files.file[0].path)
            // let filename = uuid.v1().replace(/-/g, '') + path.extname(files.file[0].path)

            formUploader.putFile(uploadToken, filename, files.file[0].path, putExtra, function(respErr, respBody, respInfo) {
              if (respErr) {
                reject(respErr)
              }

              if (respInfo.statusCode == 200) {
                fs.unlinkSync(files.file[0].path)
                resolve({
                  name: files.file[0].originalFilename,
                  ext: path.extname(files.file[0].path),
                  url: urlbase + filename,
                  type: mime.lookup(path.extname(files.file[0].path)),
                  hash: respBody.hash
                })
              } else {
                logger.error(respInfo.statusCode)
                logger.error(respBody)
                reject(respBody)
              }
            })
          } else {
            reject('no file')
          }
        })
      } catch (error) {
        reject(error)
      }
    } else {
      reject('content-type error')
    }
  })
}

const FileSaveQiniuToken = bucket => {
  let options = {
    scope: bucket
  }
  let mac = new qiniu.auth.digest.Mac(config.accessKey, config.secretKey)
  let putPolicy = new qiniu.rs.PutPolicy(options)
  let uploadToken = putPolicy.uploadToken(mac)
  return uploadToken
}

const fileSaveMongo = (req, tempDir, bucketName, urlbase) => {
  return new Promise((resolve, reject) => {
    if (req.is('multipart/*')) {
      try {
        if (!fs.existsSync(tempDir)) {
          let result = fs.mkdirSync(tempDir, { recursive: true })
          if (result) {
            reject(result)
          }
        }
        let uploadOptions = {
          autoFields: true,
          autoFiles: true,
          uploadDir: tempDir,
          maxFileSize: 10 * 1024 * 1024
        }
        let form = new multiparty.Form(uploadOptions)
        form.parse(req, (err, fields, files) => {
          if (err) {
            reject(err)
          }
          if (files.file) {
            logger.debug(files.file[0].path)
            let bucket = mongoClient.getBucket(bucketName)
            // let filename = moment().format('YYYY/MM/DD/') + uuid.v1().replace(/-/g, '') + path.extname(files.file[0].path)
            let filename = uuid.v1().replace(/-/g, '') + path.extname(files.file[0].path)
            let uploadStream = bucket.openUploadStream(filename)
            let readStream = fs.createReadStream(files.file[0].path)
            readStream.on('end', () => {
              resolve({
                name: files.file[0].originalFilename,
                ext: path.extname(files.file[0].path),
                url: urlbase + filename,
                type: mime.lookup(path.extname(files.file[0].path))
              })
            })

            readStream.on('error', err => {
              reject(err)
            })
            readStream.pipe(uploadStream)
          } else {
            reject('no file')
          }
        })
      } catch (error) {
        reject(error)
      }
    } else {
      reject('content-type error')
    }
  })
}

const fileSaveMongoByLocalPath = (filePath, bucketName, urlbase) => {
  return new Promise((resolve, reject) => {
    let bucket = mongoClient.getBucket(bucketName)
    let filename = uuid.v1().replace(/-/g, '') + path.extname(filePath)
    let uploadStream = bucket.openUploadStream(filename)
    let readStream = fs.createReadStream(filePath)
    readStream.on('end', () => {
      fs.unlinkSync(filePath)
      resolve({
        name: filename,
        ext: path.extname(filePath),
        url: urlbase + filename,
        type: mime.lookup(path.extname(filePath))
      })
    })

    readStream.on('error', err => {
      reject(err)
    })
    readStream.pipe(uploadStream)
  })
}

const fileDeleteMongoByUrl = url => {
  return new Promise((resolve, reject) => {
    if (_.isString(url)) {
      let urlpath = url.split('/')
      let bucket = mongoClient.getBucket(urlpath[urlpath.length - 2])
      bucket.find({ filename: urlpath[urlpath.length - 1] }).toArray(function(err, docs) {
        if (err) {
          reject(err)
        }
        bucket.delete(docs[0]._id, function(err) {
          if (err) {
            reject(err)
          }
          resolve()
        })
      })
    } else {
      reject('url error')
    }
  })
}

const initAliOSS = cfg => {
  aliclient = new OSS({
    region: cfg.region,
    accessKeyId: cfg.accessKeyId,
    accessKeySecret: cfg.accessKeySecret,
    bucket: cfg.bucket
  })
}

const fileSaveAli = (req, tempDir, urlbase) => {
  return new Promise((resolve, reject) => {
    if (req.is('multipart/*')) {
      try {
        if (!fs.existsSync(tempDir)) {
          let result = fs.mkdirSync(tempDir, { recursive: true })
          if (result) {
            reject(result)
          }
        }
        let uploadOptions = {
          autoFields: true,
          autoFiles: true,
          uploadDir: tempDir,
          maxFileSize: 10 * 1024 * 1024
        }
        let form = new multiparty.Form(uploadOptions)
        form.parse(req, (err, fields, files) => {
          if (err) {
            reject(err)
          }
          if (files.file) {
            logger.debug(files.file[0].path)
            let filename = moment().format('YYYY/MM/DD/') + uuid.v1().replace(/-/g, '') + path.extname(files.file[0].path)

            aliclient
              .put(filename, files.file[0].path)
              .then(result => {
                logger.debug(result)
                fs.unlinkSync(files.file[0].path)
                resolve({
                  name: files.file[0].originalFilename,
                  ext: path.extname(files.file[0].path),
                  url: urlbase + filename,
                  type: mime.lookup(path.extname(files.file[0].path))
                })
              })
              .catch(function(error) {
                reject(error)
              })
          } else {
            reject('no file')
          }
        })
      } catch (error) {
        reject(error)
      }
    } else {
      reject('content-type error')
    }
  })
}

module.exports = {
  setLogger: setLogger,
  initQiniu: initQiniu,
  fileSaveLocal: fileSaveLocal,
  fileSaveQiniu: fileSaveQiniu,
  FileSaveQiniuToken: FileSaveQiniuToken,
  fileSaveMongo: fileSaveMongo,
  fileSaveMongoByLocalPath: fileSaveMongoByLocalPath,
  fileDeleteMongoByUrl: fileDeleteMongoByUrl,
  initAliOSS: initAliOSS,
  fileSaveAli: fileSaveAli
}
