"use strict";
var fs = require("fs");
var date = require("silly-datetime");
var arr = [];
var sorts = 0;
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

    //读取资源文件
    readFolder(value);
}


/**
 * 读取资源文件
 * @param path
 * @param urlPath
 */
function readFolder(value){

    var albumName = "";
    var photosArr = [];

    var urlPath = "/photos/" +value+ "/";
    var path = "./resources/"+value+"/";

    if ("image" == value){
        albumName = "日常生活";
    }

    if ("picture" == value){
        albumName = "文字配图";
    }

    if ("system" == value){
        albumName = "网站图片";
    }

    if ("" == albumName){
        albumName = value+"相册";
    }

    fs.readdir(path, function (err, files) {
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
                    photo.name = today + " " + albumName + "(" + index + ")";
                    photo.thumbnail = urlPath + thumbnail;
                    photo.description ="照片描述";

                    photosArr.push(photo);

                }
                iterator(index + 1);

            });


            if (index == files.length) {
                var albumObjwww = {};
                albumObjwww.sort = sorts;
                albumObjwww.name = albumName;
                albumObjwww.password = "";
                albumObjwww.description = "测试相册描述";
                albumObjwww.photos = photosArr;
                arr.push(albumObjwww);
                sorts++;
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

