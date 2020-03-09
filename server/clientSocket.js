
const dbconnection = require('./dbconnection');

const regex_email= /(?:[a-z0-9!#$%&'*+\/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+\/=?^_`{|}~-]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\[(?:(?:(2(5[0-5]|[0-4][0-9])|1[0-9][0-9]|[1-9]?[0-9]))\.){3}(?:(2(5[0-5]|[0-4][0-9])|1[0-9][0-9]|[1-9]?[0-9])|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\])/;

let connectionsByEmail = {};
let connectionsBySocket = {};
let socketById = {};

exports.onConnect = function(socket) {
  const logger = global.logger;
  logger.info('onConnect socket.id='+socket.id);
  socket.on('ClientInitiatedSync', (msg, fn) => {
    logger.info('ClientInitiatedSync socket.id='+socket.id+', message was: '+msg);
    try {
      let clientInitiatedSyncData = JSON.parse(msg);
      let { email, clientId, lastSync, thisSyncClientTimestamp } = clientInitiatedSyncData;
      email = email.toLowerCase();
      let clientIdInt = parseInt(clientId);
      if (typeof email !=='string' || !regex_email.test(email) || isNaN(clientIdInt) || isNaN(lastSync)) {
        if (fn) {
          fn(JSON.stringify({ success: false, error: 'invalid email, clientId or lastSync' }));
        }
      } else {
        if (!connectionsByEmail[email]) connectionsByEmail[email] = {};
        socketById[socket.id] = socket;
        connectionsByEmail[email][clientId] = { socketId: socket.id, lastSync };
        connectionsBySocket[socket.id] = { email, clientId };
        updateTopicTables(socket, clientInitiatedSyncData, fn);
      }
    } catch(e) {
      if (fn) {
        fn(JSON.stringify({ success: false, error: 'server exception, e='+e }));
      }
    }
  });
}

exports.onDisconnect = function(socket) {
  const logger = global.logger;
  logger.info('onDisconnect socket.id='+socket.id);
  logger.info('at start of onDisconnect  connectionsByEmail='+JSON.stringify(connectionsByEmail));
  logger.info('at end of onDisconnect  connectionsBySocket='+JSON.stringify(connectionsBySocket));
  let o = connectionsBySocket[socket.id];
  logger.info('at start of onDisconnect  o='+JSON.stringify(o));
  if (o && o.email && o.clientId && connectionsByEmail[o.email] && connectionsByEmail[o.email][o.clientId]) {
    logger.info('onDisconnect connectionsByEmail[o.email][o.clientId]='+connectionsByEmail[o.email][o.clientId]);
    delete connectionsByEmail[o.email][o.clientId];
    if (Object.keys(connectionsByEmail[o.email]).length === 0) {
      delete connectionsByEmail[o.email];
    }
    delete socketById[o.socketId];
  }
  delete connectionsBySocket[socket.id];
  logger.info('at end of onDisconnect  connectionsByEmail='+JSON.stringify(connectionsByEmail));
  logger.info('at end of onDisconnect  connectionsBySocket='+JSON.stringify(connectionsBySocket));
}

let updateTopicTables = (socket, clientInitiatedSyncData, fn) => {
  const logger = global.logger;
  logger.info('updateTopicTables Entered');
  let { email, clientId, lastSync, thisSyncClientTimestamp } = clientInitiatedSyncData;
  email = email.toLowerCase();
  let minLastSyncConnected = Number.MAX_SAFE_INTEGER;
  for (const client in connectionsByEmail[email]) {
    if (client.lastSync < minLastSyncConnected) minLastSyncConnected = client.lastSync;
  }
  let thisSyncServerTimestamp = Date.now();
  let ClipboardPromise = syncMiscDataSync(email, 'Clipboard', connectionsByEmail[email],
    clientInitiatedSyncData.updates && clientInitiatedSyncData.updates.Clipboard);
  let HistoryPromise = syncHistory(email, connectionsByEmail[email], minLastSyncConnected,
    thisSyncClientTimestamp, thisSyncServerTimestamp, clientInitiatedSyncData.updates && clientInitiatedSyncData.updates.History);
  let FavoritesPromise = syncMiscDataSync(email, 'Favorites', connectionsByEmail[email],
    clientInitiatedSyncData.updates && clientInitiatedSyncData.updates.Favorites);
  let HiddenBuiltinsPromise = syncMiscDataSync(email, 'HiddenBuiltins', connectionsByEmail[email],
    clientInitiatedSyncData.updates && clientInitiatedSyncData.updates.HiddenBuiltins);
  let SettingsPromise = syncMiscDataSync(email, 'Settings', connectionsByEmail[email],
    clientInitiatedSyncData.updates && clientInitiatedSyncData.updates.Settings);
  Promise.all([ClipboardPromise, HistoryPromise, FavoritesPromise, HiddenBuiltinsPromise, SettingsPromise]).then(values => {
    updateClients(socket, email, thisSyncServerTimestamp, values, fn);
  }, () => {
    logger.error('updateTopicTables Promise.all topic promises rejected');
    if (fn) {
      fn(JSON.stringify({ success: false, error: 'ClientInitiatedSync topic promises server error' }));
    }
  }).catch(e => {
    logger.error('updateTopicTables Promise.all. topic promises e='+JSON.stringify(e));
    if (fn) {
      fn(JSON.stringify({ success: false, error: 'ClientInitiatedSync topic promises server exception' }));
    }
  });
};

let updateClients = (socket, email, thisSyncServerTimestamp, values, fn) => {
  const logger = global.logger;
  logger.info('updateClients entered');
  logger.info('updateClients values='+JSON.stringify(values));
  let returnClipboard = values[0];
  let returnHistory = values[1];
  let returnFavorites = values[2];
  let returnHiddenBuiltins = values[3];
  let returnSettings = values[4];
  let clientPromises = [];
  logger.info('updateClients before for in ');
  for (let clientId in connectionsByEmail[email]) {
    logger.info('updateClients clientId='+clientId);
    let client = connectionsByEmail[email][clientId];
    logger.info('updateClients client='+JSON.stringify(client));
    let clientPromise = new Promise((clientResolve, clientReject) => {
      logger.info('updateClients promise function entered');
      let { lastSync, socketId } = client;
      let skt = socketById[socketId];
      logger.info('updateClients typeof skt='+typeof skt);
      if (skt) {
        logger.info('updateClients before emit for socketId='+socketId+', lastSync='+lastSync);
        let serverInitiatedSyncDataJson = JSON.stringify({
          thisSyncServerTimestamp,
          updates: {
            Clipboard: returnClipboard[clientId] || null,
            History: returnHistory[clientId] || null,
            Favorites: returnFavorites[clientId] || null,
            HiddenBuiltins: returnHiddenBuiltins[clientId] || null,
            Settings: returnSettings[clientId] || null,
          }
        });
        logger.info('updateClients before emit serverInitiatedSyncDataJson='+serverInitiatedSyncDataJson);
        let ServerInitiatedSyncAck = false;
        skt.emit('ServerInitiatedSync', serverInitiatedSyncDataJson, msg => {
          logger.info('updateClients return from emit, msg='+msg+' for socketId='+socketId+', clientId='+clientId);
          logger.info('updateClients before calling updateClientTableLastSync ');
          updateClientTableLastSync(email, clientId, thisSyncServerTimestamp).then(() => {
            logger.info('updateClients updateClientTableLastSync promise resolved. Just before clientResolve ');
          }, () => {
            logger.error('updateClients updateClientTableLastSync rejected');
          }).catch(e => {
            logger.error('updateClients updateClientTableLastSync Error e='+JSON.stringify(e));
          }).finally(() => {
            ServerInitiatedSyncAck = true;
            clientResolve();
          });
        });
        setTimeout(() => {
          if (!ServerInitiatedSyncAck) {
            clientResolve();
          }
        }, 1000);
      } else {
        logger.error('updateClients no socket for socketId='+socketId+', clientId='+clientId);
        clientResolve();
      }
    });
    logger.info('updateClients before clientPromise push');
    clientPromises.push(clientPromise);
  }
  logger.info('updateClients before Promise.all. clientPromises.length='+clientPromises.length);
  Promise.all(clientPromises).then(values => {
    logger.info('updateClients Promise.all clientPromises resolved');
    if (fn) {
      fn(JSON.stringify({ success: true }));
    }
  }, () => {
    logger.error('updateClients Promise.all clientPromises rejected');
    if (fn) {
      fn(JSON.stringify({ success: false, error: 'ClientInitiatedSync server error' }));
    }
  }).catch(e => {
    logger.error('updateClients Promise.all. clientPromises e='+JSON.stringify(e));
    if (fn) {
      fn(JSON.stringify({ success: false, error: 'ClientInitiatedSync server exception' }));
    }
  });
};

/**
  @param connectedClients {object} associative array of all currently connected clients
      for the given email, whichere each entry is clientId:{socketId, clientId}
*/
let syncMiscDataSync = (email, type, connectedClients, clientInitiatedSyncData) => {
  const logger = global.logger;
  logger.info('at start of syncMiscDataSync  email='+email);
  logger.info('at start of syncMiscDataSync  type='+type);
  logger.info('at start of syncMiscDataSync  connectedClients='+JSON.stringify(connectedClients));
  logger.info('at start of syncMiscDataSync  clientInitiatedSyncData='+JSON.stringify(clientInitiatedSyncData));
  return new Promise((outerResolve, outerReject) => {
    logger.info('syncMiscDataSync promise function entered for email='+ email + ' and type=' + type);
    if (clientInitiatedSyncData !== null && typeof clientInitiatedSyncData !== 'object') {
      logger.info('syncMiscDataSync invalid clientInitiatedSyncData for email='+ email + ' and type=' + type);
      outerReject();
      return;
    }
    let timestamp, data;
    if (clientInitiatedSyncData) {
      timestamp = clientInitiatedSyncData.timestamp;
      data = JSON.stringify(clientInitiatedSyncData);
      if (isNaN(timestamp)) {
        logger.info('syncMiscDataSync invalid or missing timestamp for email='+ email + ' and type=' + type);
        outerReject();
        return;
      }
    }
    let cid;
    for (let cli in connectedClients) {
      cid = cli;
    }
    logger.info('syncMiscDataSync  cid='+cid);
    dbconnection.dbReady().then(connectionPool => {
      logger.info('syncMiscDataSync got connection');
      const miscsyncdataTable = global.miscsyncdataTable;
      logger.info('syncMiscDataSync before select. email='+email+', miscsyncdataTable='+miscsyncdataTable);
      connectionPool.query(`SELECT * FROM ${miscsyncdataTable} WHERE email = ? and type = ?`, [email, type], function (error, results, fields) {
        logger.info('syncMiscDataSync select return function start ');
        if (error) {
          logger.error("syncMiscDataSync select failure for email=" + email + " and type=" + type);
          outerReject();
        } else {
          logger.info('syncMiscDataSync after select, results='+JSON.stringify(results));
          let currentRows = results;
          if (currentRows.length  > 1) {
            logger.error("syncMiscDataSync select found more than one entry for email=" + email + " and type=" + type);
            outerReject();
          } else {
            let innerPromise = new Promise((innerResolve, innerReject) => {
              if (currentRows.length === 1) {
                let dbRecord = currentRows[0];
                if (clientInitiatedSyncData === null || dbRecord.timestamp >= timestamp) {
                  innerResolve(null);
                } else {
                  connectionPool.query(`UPDATE ${miscsyncdataTable} SET timestamp = ?, data = ? WHERE email = ? and type = ?`, [timestamp, data, email, type], function (error, results, fields) {
                    if (error) {
                      logger.error("miscsyncdataTable update database failure for email=" + email + " and type=" + type);
                      innerReject();
                    } else {
                      innerResolve(clientInitiatedSyncData);
                    }
                  });
                }
              } else {
                if (clientInitiatedSyncData === null) {
                  logger.info("miscsyncdataTable no new data, no old data for email=" + email + " and type=" + type);
                  innerResolve(null);
                } else {
                  let dataObj = { email, type, timestamp, data };
                  connectionPool.query(`INSERT INTO ${miscsyncdataTable} SET ?`, dataObj, function (error, results, fields) {
                    if (error) {
                      logger.error("miscsyncdataTable insert database failure for email=" + email + " and type=" + type);
                      innerReject();
                    } else {
                      innerResolve(clientInitiatedSyncData);
                    }
                  });
                }
              }
            });
            innerPromise.then(retval => {
              logger.info("syncMiscDataSync innerPromise resolved for email=" + email + " and type=" + type);
              let returnObj = {};
              for (let clientId in connectedClients) {
                returnObj[clientId] = retval;
              };
              logger.info('syncMiscDataSync, returnObj='+JSON.stringify(returnObj));
              outerResolve(returnObj);
            }, () => {
              logger.error("syncMiscDataSync innerPromise reject email=" + email + " and type=" + type);
              outerReject();
            }).catch(e => {
              logger.error("syncMiscDataSync innerPromise exception for email=" + email + " and type=" + type);
              outerReject();
            });
          }
        }
      });
    }, () => {
      logger.error("syncMiscDataSync: no database connection");
      outerReject();
    }).catch(e => {
      logger.error("syncMiscDataSync: promise exception");
      outerReject();
    });
  });
}




/**
history table delete: delete from table where created in (?), array
additions: INSERT INTO tbl_name (a,b,c) VALUES ?, array of arrays, where inner are phrases
return history since minLastSyncConnected
connectedClients[{clientId, lastSync}],
  @param connectedClients {object} associative array of all currently connected clients
      for the given email, whichere each entry is clientId:{socketId, clientId}
*/
let syncHistory = (email, connectedClients, minLastSyncConnected, thisSyncClientTimestamp, thisSyncServerTimestamp, clientInitiatedSyncData) => {
  const logger = global.logger;
  logger.info('at start of syncHistory  connectedClients='+JSON.stringify(connectedClients));
  logger.info('at start of syncHistory  minLastSyncConnected='+minLastSyncConnected);
  logger.info('at start of syncHistory  thisSyncServerTimestamp='+thisSyncServerTimestamp);
  logger.info('at start of syncHistory  clientInitiatedSyncData='+JSON.stringify(clientInitiatedSyncData));
  return new Promise((outerResolve, outerReject) => {
    logger.info('syncHistory promise function entered ');
    let cid;
    for (let cli in connectedClients) {
      cid = cli;
    }
    logger.info('syncHistory  cid='+cid);
    dbconnection.dbReady().then(connectionPool => {
      logger.info('syncHistory got connection');
      const historyTable = global.historyTable;
      logger.info('syncHistory before calcMinTime. minLastSyncConnected='+minLastSyncConnected+', thisSyncClientTimestamp='+thisSyncClientTimestamp+', thisSyncServerTimestamp='+thisSyncServerTimestamp);
      let mintime = calcMinTime([minLastSyncConnected, thisSyncClientTimestamp, thisSyncServerTimestamp]);
      logger.info('syncHistory before select. mintime='+mintime+', email='+email+', historyTable='+historyTable);
      let { HistoryPendingDeletions, HistoryPendingAdditions } = clientInitiatedSyncData;
      let additionTimestamps = HistoryPendingAdditions.map(item => item.timestamp);
      if (!Array.isArray(additionTimestamps) || additionTimestamps.length === 0) additionTimestamps = [1]; // query fails with empty array. Time=1 is 1ms into 1970
      logger.info('syncHistory before select, additionTimestamps='+JSON.stringify(additionTimestamps));
      connectionPool.query(`SELECT * FROM ${historyTable} WHERE (email = ? and timestamp > ?) or timestamp IN (?)`, [email, mintime, additionTimestamps], function (error, results, fields) {
        logger.info('syncHistory select return function start ');
        if (error) {
          logger.error("syncHistory select history database failure for email '" + email + "'");
          outerReject();
        } else {
          logger.info('syncHistory after select, results='+JSON.stringify(results));
          let currentRows = results;
          logger.info('syncHistory after select, HistoryPendingDeletions='+JSON.stringify(HistoryPendingDeletions));
          logger.info('syncHistory after select, HistoryPendingAdditions='+JSON.stringify(HistoryPendingAdditions));
          let currentRowsIndex = {};
          currentRows.forEach(row => {
            currentRowsIndex[row.timestamp] = row;
          });
          logger.info('syncHistory after select, currentRowsIndex='+JSON.stringify(currentRowsIndex));
          let filteredDeletions = HistoryPendingDeletions.filter(item => currentRowsIndex[item.timestamp]);
          logger.info('syncHistory after select, filteredDeletions='+JSON.stringify(filteredDeletions));
          let tableDeletions = filteredDeletions.map(item => item.timestamp);
          logger.info('syncHistory after select, tableDeletions='+JSON.stringify(tableDeletions));
          let filteredAdditions = HistoryPendingAdditions.filter(item => !currentRowsIndex[item.timestamp]);
          logger.info('syncHistory after select, filteredAdditions='+JSON.stringify(filteredAdditions));
          let tableAdditions = filteredAdditions.map(item => [email, item.timestamp, JSON.stringify(item)] );
          logger.info('syncHistory after select, tableAdditions='+JSON.stringify(tableAdditions));
          let deletePromise = new Promise((resolve, reject) => {
            if (tableDeletions.length === 0) {
              resolve();
            } else {
              connectionPool.query(`DELETE FROM ${historyTable} WHERE timestamp IN (?)`, tableDeletions, function (error, results, fields) {
                if (error) {
                  logger.error('DELETE failed syncHistory. error='+error);
                  reject();
                } else {
                  logger.info('syncHistory delete success');
                  resolve();
                }
              });
            }
          });
          let insertPromise = new Promise((resolve, reject) => {
            if (tableAdditions.length === 0) {
              resolve();
            } else {
              connectionPool.query(`INSERT INTO ${historyTable} (email, timestamp, phrase) VALUES ?`, [tableAdditions], function (error, results, fields) {
                if (error) {
                  logger.error("insert syncHistory database failure for email '" + email + "'");
                  reject();
                } else {
                  logger.info('syncHistory insert success');
                  resolve();
                }
              });
            }
          });
          Promise.all([deletePromise, insertPromise]).then(values => {
            logger.info('syncHistory promise all entered');
            let returnObj = {};
            for (let clientId in connectedClients) {
              let client = connectedClients[clientId];
              let { lastSync } = client;
              let mintime = calcMinTime([lastSync]);
              returnObj[clientId] = {
                deletions: filteredDeletions.filter(item => item.timestamp > mintime).concat(HistoryPendingDeletions),
                additions: filteredAdditions.filter(item => item.timestamp > mintime).concat(HistoryPendingAdditions),
              };
            };
            logger.info('syncHistory, returnObj='+JSON.stringify(returnObj));
            outerResolve(returnObj);
          }, () => {
            logger.error('syncHistory Promise.all rejected');
            outerReject();
          }).catch(e => {
            logger.error('ClientInitiatedSync Promise.all. e='+JSON.stringify(e));
            outerReject();
          });
        }
      });
    }, () => {
      logger.error("syncHistory: no database connection");
      outerReject();
    }).catch(e => {
      logger.error("syncHistory: promise exception");
      outerReject();
    });
  });
}

let updateClientTableLastSync = (email, clientId, thisSyncServerTimestamp) => {
  const logger = global.logger;
  logger.info('updateClientTableLastSync entered. email='+email+', clientId='+clientId+', thisSyncServerTimestamp='+thisSyncServerTimestamp);
  return new Promise((resolve, reject) => {
    logger.info('updateClientTableLastSync start of promise function ');
    dbconnection.dbReady().then(connectionPool => {
      logger.info('updateClientTableLastSync got connection');
      const clientTable = global.clientTable;
      connectionPool.query(`SELECT * FROM ${clientTable} WHERE email = ? and clientId = ?`, [email, clientId], function (error, results, fields) {
        if (error) {
          logger.error("updateClientTableLastSync select client database failure for email '" + email + "'");
          reject();
        } else {
          if (results.length > 1) {
            logger.error("updateClientTableLastSync select client database error for email '" + email + "', multiple entries");
            reject();
          } else if (results.length === 1) {
            logger.info('updateClientTableLastSync before update');
            connectionPool.query(`UPDATE ${clientTable} SET lastSync = ? WHERE email = ? and clientId = ?`, [thisSyncServerTimestamp, email, clientId], function (error, results, fields) {
              if (error) {
                logger.error("Update new client update database failure for email '" + email + "'");
                reject();
              } else {
                logger.info('updateClientTableLastSync update success');
                resolve();
              }
            });
          } else {
            logger.info('updateClientTableLastSync before insert');
            let o = { email, clientId, lastSync: thisSyncServerTimestamp };
            connectionPool.query(`INSERT INTO ${clientTable} SET ?`, o, function (error, results, fields) {
              if (error) {
                logger.error("insert new client update database failure for email '" + email + "'");
                reject();
              } else {
                logger.info('updateClientTableLastSync insert success');
                resolve();
              }
            });
          }
        }
      });
    }, () => {
      logger.error("updateClientTableLastSync: no database connection");
      reject();
    }).catch(e => {
      logger.error("updateClientTableLastSync: promise exception");
      reject();
    });
  });
};

let calcMinTime = arr => {
  let onehour = 1000*60*60;
  return Math.max(Math.min(...arr) - onehour,  0);









}
