const _ = require('lodash')
const schedule = require('node-schedule')
let logger = console

const setLogger = appointLogger => {
  logger = appointLogger.createLogger(__filename)
}

const initSchedule = (cfg, router) => {
  if (global.scheduleJobs) {
    if (!_.isEmpty(global.scheduleJobs)) {
      for (let job of Object.values(global.scheduleJobs)) {
        job.cancel()
      }
    }
  }
  global.scheduleJobs = {}
  for(let job of cfg.scheduleJobs){
    let func = router[job.name]
    if(func) {
      try {
        global.scheduleJobs[job.name] = schedule.scheduleJob(job.rule, func)
      } catch (error) {
        logger.error(error.stack)
      }
      
    } else {
      logger.error(job.name, ' do not exist')
    }
  }
}

module.exports = {
  setLogger: setLogger,
  initSchedule: initSchedule
}
