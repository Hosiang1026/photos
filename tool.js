"use strict";
var fs = require("fs");
var date = require("silly-datetime");
var path = "./image/";

fs.readdir(path, function (err, files) {
    if (err) {
        return;
    }

    var arr = [];
    var albumObjwww = {};
    var photosArr = [];

    //"抱歉，你没有权限访问";
    (function iterator(index) {
        if (index == files.length) {
            // console.log(JSON.stringify(arr, null, "\t"));
            fs.writeFile("./photos.json", JSON.stringify(arr, null, "\t"));
            console.log('write photos.json success!');
            return;
        }
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
                photo.thumbnail = "/photos/image/"+thumbnail;
                photo.description ="照片描述";

                photosArr.push(photo);

            }
            iterator(index + 1);
        })
    }(0));

    albumObjwww.sort = "0";
    albumObjwww.name = "壁纸相册";
    albumObjwww.password = "22";
    albumObjwww.description = "相册描述";
    albumObjwww.photos = photosArr;

    arr.push(albumObjwww);

});