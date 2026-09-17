"use strict";
var fs = require("fs");
var path = require("path");
var date = require("silly-datetime");

var arr = [];
var sorts = 0;
var components = [];

var albumNameMap = {
    'image': '日常生活',
    'picture': '文字配图',
    'system': '网站图片',
    'diary': '加密相册'
};

var IMG_EXT = {
    '.jpg': 1, '.jpeg': 1, '.png': 1, '.gif': 1, '.webp': 1, '.bmp': 1
};

const files = fs.readdirSync('./resources');
files.forEach(function (item) {
    var stat = fs.lstatSync("./resources/" + item);
    if (stat.isDirectory() === true) {
        components.push(item)
    }
});

console.log(components);

for (var j = 0, len = components.length; j < len; j++) {
    readFolder(components[j]);
}

function isEncryptedAlbum(albumName, dirPath) {
    if (albumName && albumName.indexOf("密") !== -1) return true;
    return fs.existsSync(path.join(dirPath, ".crypto.json"));
}

function readCrypto(dirPath) {
    var p = path.join(dirPath, ".crypto.json");
    if (!fs.existsSync(p)) return null;
    try {
        return JSON.parse(fs.readFileSync(p, "utf8"));
    } catch (e) {
        return null;
    }
}

function readFolder(value) {
    var photosArr = [];
    var urlPath = "/photos/" + value + "/";
    var dirPath = "./resources/" + value + "/";
    var albumName = albumNameMap[value];
    if (undefined == albumName) {
        albumName = value;
    }

    var encrypted = isEncryptedAlbum(albumName, dirPath);
    var cryptoMeta = encrypted ? readCrypto(dirPath) : null;

    fs.readdir(dirPath, function (err, files) {
        if (err) {
            return;
        }

        files = files.filter(function (name) {
            if (name === ".crypto.json") return false;
            if (name.indexOf(".") === 0) return false;
            var ext = path.extname(name).toLowerCase();
            if (encrypted) {
                return name.slice(-4) === ".enc";
            }
            if (name.slice(-4) === ".enc") return false;
            return !!IMG_EXT[ext];
        }).sort();

        (function iterator(index) {
            if (index === files.length) {
                var albumObj = {};
                albumObj.sort = sorts;
                albumObj.name = albumName;
                albumObj.description = "测试相册描述";
                albumObj.photos = photosArr;
                if (encrypted) {
                    albumObj.encrypted = true;
                    albumObj.crypto = cryptoMeta;
                    albumObj.password = "";
                } else {
                    albumObj.encrypted = false;
                    albumObj.password = "";
                }
                arr.push(albumObj);
                sorts++;
                if (arr.length == components.length) {
                    writeJsonFile(arr);
                }
                return;
            }

            fs.stat(dirPath + files[index], function (err, stats) {
                if (!err && stats.isFile()) {
                    var today = date.format(new Date(), "YYYY-MM-DD");
                    var base = files[index].replace(/\.enc$/i, "");
                    photosArr.push({
                        sort: photosArr.length,
                        name: today + " " + albumName + "(" + photosArr.length + ")",
                        thumbnail: urlPath + files[index],
                        description: "照片描述",
                        file: base
                    });
                }
                iterator(index + 1);
            });
        }(0));
    });
}

function writeJsonFile(arr) {
    console.log(JSON.stringify(arr, null, "\t"));
    fs.writeFile("./resources/photos.json", JSON.stringify(arr, null, "\t"), function (err) {
        if (err) throw err;
        console.log("write photos.json success!");
    });
}
