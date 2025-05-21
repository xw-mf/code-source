const path = require('path')
const fs = require('fs')

const filesPath = path.resolve(__dirname, '响应系统')
const files = fs.readdirSync(filesPath)

// console.log(filesPath)
console.log(files)

files.forEach(file => {
    const filePath = path.resolve(__dirname, `响应系统/${file}`)
    console.log(filePath)
    // 获取文件扩展名
    const extname = path.extname(filePath)
    console.log(extname)
    if (extname.toLowerCase() === '.js') {
        const newPath = path.resolve(__dirname, `响应系统/${file.replace(/^index\d+/g, '')}`)
        console.log('newPath', newPath)
        fs.renameSync(filePath, newPath, (error) => {
            if (error) {
                console.log('重命名失败！');
                return
            }
            console.log('重命名成功！');
        })
    }
})