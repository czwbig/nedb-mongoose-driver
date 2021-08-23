/* eslint-disable no-underscore-dangle */
/* eslint-disable no-continue */
/* eslint-disable prefer-spread */
/* eslint-disable consistent-return */
/* eslint-disable no-restricted-syntax */
/* eslint-disable prefer-rest-params */
/* eslint-disable guard-for-in */
/* eslint-disable func-names */
/* eslint-disable import/no-dynamic-require */
const ObjectId = require('./objectid')
const path = require('path');
const MongooseCollection = require('mongoose/lib/collection');
const DataStore = require('nedb-for-mongoose');
const mongooseUtilPath = path.resolve(path.dirname(require.resolve('mongoose')), './lib/utils')

// eslint-disable-next-line global-require
const debug = require('debug')(`${require('../package.json').name}:collection`);

// Override the function to generate new _id MongoDB suitable random string
DataStore.prototype.createNewId = function () {
    return new ObjectId().toString();
};

/**
 * A [node-mongodb-native](https://github.com/mongodb/node-mongodb-native) collection implementation.
 *
 * All methods methods from the [node-mongodb-native](https://github.com/mongodb/node-mongodb-native) driver are copied and wrapped in queue management.
 *
 * @inherits Collection
 * @api private
 */

function NeDBCollection() {
    this.collection = null;
    MongooseCollection.apply(this, arguments);
}

/*!
 * Inherit from abstract Collection.
 */

// eslint-disable-next-line no-proto
NeDBCollection.prototype.__proto__ = MongooseCollection.prototype;

/**
 * Called when the connection opens.
 *
 * @api private
 */

NeDBCollection.prototype.onOpen = function () {
    const self = this;

    const options = Object.assign(
      { filename: path.join(self.conn.options.dbPath, `${self.name}.db`) },
      self.conn.options.nedbOptions
    );

    debug('open collection', { arguments, options });

    const collection = new DataStore(options);
    /*
        collection.load().then(() => {
            self.collection = collection;
            MongooseCollection.prototype.onOpen.call(self);
        }).catch(err => self.conn.emit('error', err));*/
    collection.loadDatabase(err => {
        if (err) {
            self.conn.emit('error', err)
        } else {
            self.collection = collection;
            MongooseCollection.prototype.onOpen.call(self);
        }
    })
};

/**
 * Called when the connection closes
 *
 * @api private
 */

NeDBCollection.prototype.onClose = function () {
    MongooseCollection.prototype.onClose.call(this);
};

NeDBCollection.prototype.$print = function (name, i, args) {
    let moduleName = '\x1B[0;36mMongoose:\x1B[0m ';
    let functionCall = [name, i].join('.');
    let _args = [];
    for (let j = args.length - 1; j >= 0; --j) {
        if (this.$format(args[j]) || _args.length) {
            _args.unshift(this.$format(args[j]));
        }
    }
    let params = '(' + _args.join(', ') + ')';

    console.error(moduleName + functionCall + params);
};
NeDBCollection.prototype.$format = function (arg) {
    let type = typeof arg;
    if (type === 'function' || type === 'undefined') return '';
    return format(arg);
};

function map(o) {
    return format(o, true);
}

function formatObjectId(x, key) {
    let representation = 'ObjectId("' + x[key].toHexString() + '")';
    x[key] = {
        inspect: function () {
            return representation;
        }
    };
}

function formatDate(x, key) {
    let representation = 'new Date("' + x[key].toUTCString() + '")';
    x[key] = {
        inspect: function () {
            return representation;
        }
    };
}

function format(obj, sub) {
    if (obj && typeof obj.toBSON === 'function') {
        obj = obj.toBSON();
    }
    const utils = require(mongooseUtilPath);
    let x = utils.clone(obj, {retainKeyOrder: 1, transform: false});
    let representation;

    if (x != null) {

        if (x.constructor.name === 'Binary') {
            x = 'BinData(' + x.sub_type + ', "' + x.toString('base64') + '")';
        } else if (x.constructor.name === 'ObjectID') {
            representation = 'ObjectId("' + x.toHexString() + '")';
            x = {
                inspect: function () {
                    return representation;
                }
            };
        } else if (x.constructor.name === 'Date') {
            representation = 'new Date("' + x.toUTCString() + '")';
            x = {
                inspect: function () {
                    return representation;
                }
            };
        } else if (x.constructor.name === 'Object') {
            let keys = Object.keys(x);
            let numKeys = keys.length;
            let key;
            for (let i = 0; i < numKeys; ++i) {
                key = keys[i];
                if (x[key]) {
                    if (typeof x[key].toBSON === 'function') {
                        x[key] = x[key].toBSON();
                    }
                    if (x[key].constructor.name === 'Binary') {
                        x[key] = 'BinData(' + x[key].sub_type + ', "' +
                          x[key].buffer.toString('base64') + '")';
                    } else if (x[key].constructor.name === 'Object') {
                        x[key] = format(x[key], true);
                    } else if (x[key].constructor.name === 'ObjectID') {
                        formatObjectId(x, key);
                    } else if (x[key].constructor.name === 'Date') {
                        formatDate(x, key);
                    } else if (Array.isArray(x[key])) {
                        x[key] = x[key].map(map);
                    }
                }
            }
        }
        if (sub) return x;
    }

    return require('util')
      .inspect(x, false, 10, true)
      .replace(/\n/g, '')
      .replace(/\s{2,}/g, ' ');
}

function iter(method) {
    NeDBCollection.prototype[method] = function () {
        // console.log(`mongoose.nedb.${method}`, arguments);

        if (this.buffer) {
            this.addQueue(method, arguments);
            return;
        }

        const { collection } = this;
        const debug = this.conn.base.options.debug;
        if (debug) {
            if (typeof debug === 'function') {
                debug.apply(this,
                  [this.name, method].concat(Array.from(arguments)));
            } else {
                this.$print(this.name, method, arguments);
            }
        }
        return collection[method].apply(collection, arguments);
    };
}

for (const prop of Object.getOwnPropertyNames(DataStore.prototype)) {
    try {
        if (typeof DataStore.prototype[prop] !== 'function') {
            continue;
        }
    } catch (e) {
        continue;
    }

    iter(prop);
}
/**
 * Retrieves information about this collections indexes.
 *
 * @param {Function} callback
 * @method getIndexes
 * @api public
 */

NeDBCollection.prototype.getIndexes = NeDBCollection.prototype.indexInformation;

/*!
 * Module exports.
 */

module.exports = NeDBCollection;
