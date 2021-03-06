// 路由相关
const Router = require('koa-router')
// 工具相关
const execsh = require('../util/execsh')
const _ = require('lodash')
const axios = require('axios')
// 日志相关
const config = require('config')
const log = require('tracer').colorConsole({ level: config.log.level })
// 初始化路由
const router = new Router()

// 持久化构建流
router.post('/:server/', async function (ctx, next) {
    log.info(`开始自动构建【${ctx.params.server}】...`)
    let deployCommand = config.sh[ctx.params.server]
    let res = await axios.post(`http://localhost:${config.server.port}/xci/xnosql/ciflow/create`, {
        server: ctx.params.server,
        type: 'static',
        status: 'building',
        command: deployCommand,
        result: '构建中...',
        createdAt: Date.now()
    })
    ctx.deployCommand = deployCommand
    ctx._id = res.data.res
    return next()
})

/**
 * 静态资源部署
 */
router.post('/:server/', async function (ctx, next) {
    //req.headers['x-gitlab-token'] == 'j9hb5ydtetfbRGQy42tNhztmJe1qSvC'
    let deployCommand = ctx.deployCommand
    // 数组直接运行命令
    if (deployCommand instanceof Array) {
        execsh.run(deployCommand.join(' && ')).then((res) => {
            // 更新执行结果
            updateCIFlow(ctx, res)
        })
    }
    // 根据同步和异步命令执行
    else {
        let promiseArr = []
        // 解析同步和异步命令
        let syncCommandArr = _.flatten(deployCommand.sync)
        let asyncCommandArr = deployCommand.async
        // 执行同步命令
        log.info('开始执行同步命令...')
        execsh.run(syncCommandArr.join(' && ')).then((syncRes) => {
            // 执行异步命令
            log.info('开始执行异步命令...')
            for (let commandArr of asyncCommandArr) {
                promiseArr.push(execsh.run(commandArr.join(' && ')))
            }
            // 更新执行结果
            Promise.all(promiseArr).then((res) => {
                res.unshift(syncRes)
                updateCIFlow(ctx, res)
            })
        })
    }
    ctx.body = 'Y'
})

// 内部方法：更新构建流
function updateCIFlow(ctx, res) {
    axios.post(`http://localhost:${config.server.port}/xci/xnosql/ciflow/update`, {
        _id: ctx._id,
        status: 'finish',
        updatedAt: Date.now(),
        result: res
    })
    log.info(`完成自动构建【${ctx.params.server}】`)
}

module.exports = router