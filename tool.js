"use strict";
var fs = require("fs");
var date = require("silly-datetime");
var arr = [];
var albumObjwww = {};
var components = [];

const files = fs.readdirSync('./resources');
files.forEach(function (item) {
    var stat = fs.lstatSync("./resources/" + item);
    if (stat.isDirectory() === true) {
        components.push(item)
    }
});

console.log(components);

/**
 * 遍历文件夹
 */
for(var j = 0,len=components.length; j < len; j++) {
    var value = components[j];
    var urlPath = "/photos/" +value+ "/";
    var path = "./resources/"+value+"/";
    console.log(path);

    albumObjwww.sort = j;
    albumObjwww.name = value+"相册";
    albumObjwww.password = "";
    albumObjwww.description = "测试相册描述";

    //读取资源文件
    readFolder(path,urlPath,albumObjwww);
}


/**
 * 读取资源文件
 * @param path
 * @param urlPath
 */
function readFolder(path,urlPath,albumObjwww){

    var photosArr = [];

    fs.readdir(path,albumObjwww, function (err, files) {
        if (err) {
            return;
        }

        (function iterator(index) {
            fs.stat(path + files[index], function (err, stats) {
                if (err) {
                    return;
                }
                if (stats.isFile()) {

                    var photo = {};
                    var thumbnail = files[index];
                    //npm install silly-datetime
                    var today = date.format(new Date(),'YYYY-MM-DD');
                    photo.sort = index;
                    photo.name = today + " 高清壁纸(" + index + ")";
                    photo.thumbnail = urlPath + thumbnail;
                    photo.description ="照片描述";

                    photosArr.push(photo);

                }
                iterator(index + 1);

            });

            if (index == files.length) {
                albumObjwww.photos = photosArr;
                arr.push(albumObjwww);
                if (arr.length == components.length){
                    //写入Json文件
                    writeJsonFile(arr);
                }
            }
        }(0));

    });
}

/**
 * 写入Json文件
 */
function writeJsonFile(arr) {

    //fs.writeFile("./photos.json", JSON.stringify(arr, null, "\t"));
    console.log(JSON.stringify(arr, null, "\t"));
    fs.writeFile("./resources/photos.json", JSON.stringify(arr, null, "\t"), function (err) {
        if (err) throw err;
        console.log('write photos.json success!');
    });


}

