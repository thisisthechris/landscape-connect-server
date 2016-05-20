var mongoose = require('mongoose')
var escape = require('escape-html')
var common = require('../common')
var async = require('async')
var s3Client = require('../s3-client')
var eventServer = require('../eventemitter')
var qrLib = require('qr-image')

module.exports = function (app) {
  var objName = 'Questionnaire'
  var modelName = 'questionnaire'

  var create = function (req, res, next) {
    eventServer.emit(objName + ':creating', instance)
    var toInsert = req.body

    var Model = mongoose.model(modelName)
    var instance = new Model(toInsert)

    // Questionnaire specific code
    instance.owner = req.user
    // End Specific code

    instance.save(function (err) {
      if (err) {
        eventServer.emit(objName + ':error', err)
        res.status(400).json(JSON.stringify({'err': err.message}))
        return res.end()
      }

      // Publish event to the system
      eventServer.emit(objName + ':create', instance)

      res.json(instance) // JSON
      res.end()
    })
  }

  function buildQrImgPipe (str) {
    var qr_svg = qrLib.image(str, { type: 'png' })
    return qr_svg // .pipe(require('fs').createWriteStream(str.split("/").push() + '.png'))
  }

  var qr = function (req, res, next) {
    mongoose.model(modelName).findOne({serverId: req.params.id}, function (err, doc) {
      if (err) return next(err)
      if (!doc) return next()
      // QR code is to the generic URL. From there depending on the user-agent either the app or JSON is displayed
      var qr = buildQrImgPipe(process.env.SITE_URL + '/questionnaires/' + doc.serverId)
      qr.pipe(res)
    })
  }

  var list = function (req, res, next) {
    eventServer.emit(objName + ':list', {})
    var cback = function (err, results) {
      if (err) return next(err)
      res.json({result: results})
    }

    if (req.user && req.user.isSuper) {
    mongoose.model(modelName).find({}).populate('owner', 'username _id').exec(function (err, res) {
      // Link questionnaire with user
      cback(err, res)
    })
    } else {
      mongoose.model(modelName).find({owner: req.user._id}).select('-owner').exec(cback)//user: req.user._id // {'owner': req.user._id}
    }
  }

  var list_public = function (req, res, next) {
    eventServer.emit(objName + ':list', {})
    var cback = function (err, results) {
      if (err) return next(err)
      res.json({result: results})
    }

    mongoose.model(modelName).find({public: true}).populate('owner', 'username _id').exec(function (err, res) {
      cback(err, res)
    })
  }

  var remove = function (req, res, next) {
    mongoose.model(modelName).findOneAndRemove({serverId: req.params.id}, function (err, doc) {
      if (err) return next(err)
      eventServer.emit(objName + ':delete', doc)
      res.sendStatus(200)
    })
  }

  var update = function (req, res, next) {
    mongoose.model(modelName).findOneAndUpdate({serverId: req.params.id}, req.body, {'new': true}, function (err, doc) {
      if (err) return next(err)
      eventServer.emit(objName + ':update', doc)
      res.json(doc)
    })
  }

  var read = function (req, res, next) {
    mongoose.model(modelName).findOne({serverId: req.params.id}).populate('owner', 'email _id').exec(function (err, doc) {
      if (err) return next(err)
      if (!doc) return res.sendStatus(404)
      res.send(doc)
    })
  }

  return {
    'create': create,
    'list': list,
    'remove': remove,
    'update': update,
    'read': read,
    'qr': qr
  }
}
