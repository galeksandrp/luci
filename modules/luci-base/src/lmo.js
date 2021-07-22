#!/usr/bin/env node

// Usage
// lmo2json <filepath.lmo> <lmo payload encoding or 'default'> <json stringify space>
// lmo2po <filepath.lmo> <lmo payload encoding or 'default'> <localized.lmo>

var fsPromises = require('fs/promises');
var path = require('path');

var ARGV_EXECUTED_FILEPATH = process.argv[1];

var ARGV_LMO_FILEPATH = process.argv[2];
var ARGV_LMO_VALUE_ENCODING = process.argv[3];
var ARGV_JSON_STRINGIFY_SPACE = process.argv[4];
var ARGV_LMO_SECOND_FILEPATH = process.argv[4];

// Config variables

var LMO_INDEX_OFFSET_OFFSET_LENGTH = 4; // bytes
var LMO_INDEX_KEYORVALUE_LENGTH = 4; // bytes

var LMO_INDEX_KEYORVALUE_NUMBER = 4; // int

var LINE_BREAK = '\n';

var LMO_INDEX_ENTRY_LENGTH = LMO_INDEX_KEYORVALUE_NUMBER * LMO_INDEX_KEYORVALUE_LENGTH; // bytes

// Working variables

var LMO_FILEPATH = ARGV_LMO_FILEPATH;
var LMO_SECOND_FILEPATH = ARGV_LMO_SECOND_FILEPATH;

var LMO_VALUE_ENCODING = undefined;
if (ARGV_LMO_VALUE_ENCODING !== 'default') {
    LMO_VALUE_ENCODING = ARGV_LMO_VALUE_ENCODING;
}

var JSON_STRINGIFY_SPACE = 4;
if (ARGV_JSON_STRINGIFY_SPACE !== undefined) {
    JSON_STRINGIFY_SPACE = toInt(ARGV_JSON_STRINGIFY_SPACE);
}

var EXECUTED_FILENAME = path.basename(ARGV_EXECUTED_FILEPATH);

// Basic functions

function toHEX(value) {
    return value.toString(16);
}

function toLength(value) {
    return value.length;
}

function toInt(value) {
    var parsedInt = parseInt(value);

    if (parsedInt === NaN) {
        return value;
    }

    return parsedInt;
}

// Basic offsets functions

function numberToOffset(number, valueLength) {
    return number * valueLength;
}

function lengthToLastOffset(offset, length) {
    return offset + length;
}

// LMO offsets functions

function bufferToLMOIndexTableOffsetOffset(lmoBuffer) {
    return lmoBuffer.length - LMO_INDEX_OFFSET_OFFSET_LENGTH;
}

function bufferToLMOIndexTableOffset(lmoBuffer) {
    var lmoIndexTableOffsetOffset = bufferToLMOIndexTableOffsetOffset(lmoBuffer);

    return lmoBuffer.readUInt32BE(lmoIndexTableOffsetOffset);
}

// LMO functions

function lmoFilepathToBuffer(lmoFilepath) {
    return fsPromises.readFile(lmoFilepath);
}

function bufferToLMOIndexBuffer(lmoBuffer) {
    return lmoBuffer.slice(bufferToLMOIndexTableOffset(lmoBuffer),
        bufferToLMOIndexTableOffsetOffset(lmoBuffer));
}

function lmoBufferToEntries(lmoBuffer, lmoValueEncoding) {
    lmoIndexBuffer = bufferToLMOIndexBuffer(lmoBuffer);

    return Array(lmoIndexBuffer.length / LMO_INDEX_ENTRY_LENGTH).fill(0).map(function (elementValue, elementNumber) {
        var lmoEntryOffset = numberToOffset(elementNumber, LMO_INDEX_ENTRY_LENGTH);
        var lmoEntryBuffer = lmoIndexBuffer.slice(lmoEntryOffset,
            lengthToLastOffset(lmoEntryOffset, LMO_INDEX_ENTRY_LENGTH));

        var lmoIndexEntry = {
            valueOffset: lmoEntryBuffer.readUInt32BE(numberToOffset(2, LMO_INDEX_KEYORVALUE_LENGTH)),
            valueLength: lmoEntryBuffer.readUInt32BE(numberToOffset(3, LMO_INDEX_KEYORVALUE_LENGTH))
        };

        return {
            keyHash: lmoEntryBuffer.readUInt32BE(numberToOffset(0, LMO_INDEX_KEYORVALUE_LENGTH)),
            valueHash: lmoEntryBuffer.readUInt32BE(numberToOffset(1, LMO_INDEX_KEYORVALUE_LENGTH)),
            value: lmoBuffer.toString(lmoValueEncoding,
                lmoIndexEntry.valueOffset,
                lengthToLastOffset(lmoIndexEntry.valueOffset, lmoIndexEntry.valueLength))
        };
    });
}

// PO functions

function lmoEntriesToMSGIDPO(lmoEntries) {
    return lmoEntries.map(function(lmoEntry) {
        return {
            msgctxt: lmoEntry.keyHash,
            msgid: '"' + lmoEntry.value + '"'
        };
    }, {});
}

function lmoEntriesToMSGSTRPO(lmoEntries) {
    return lmoEntries.reduce(function (poEntries, lmoEntry) {
        poEntries[lmoEntry.keyHash] = {
            msgstr: '"' + lmoEntry.value + '"'
        };

        return poEntries;
    }, {});
}

function poEntriesPartsToPOEntries(pos){
    return pos[0].map(function(poEntry){
        return {
            ...poEntry,
            ...pos[1][poEntry.msgctxt]
        }
    });
}

function poEntriesToPO(poEntries) {
    return poEntries.map(function(poEntry){
        return Object.keys(poEntry).reduce(function(message, poEntryKey) {
            return message
                + poEntryKey + " " + poEntry[poEntryKey] + LINE_BREAK;
        }, "");
    }).join(LINE_BREAK);
}

// Wrapper functions

function lmoBufferToEntriesWrapper(lmoBuffer) {
    return lmoBufferToEntries(lmoBuffer, LMO_VALUE_ENCODING);
};

function jsonStringifyWrapper(json) {
    return JSON.stringify(json, undefined, JSON_STRINGIFY_SPACE);
}

// Main functions

function cli() {
    if (EXECUTED_FILENAME == 'lmo2json') {
        return lmoFilepathToBuffer(LMO_FILEPATH)
            .then(lmoBufferToEntriesWrapper)
            // .then(toLength)
            //    .then(toHEX)
            .then(jsonStringifyWrapper)
            .then(console.log);
    }

    if (EXECUTED_FILENAME == 'lmo2po') {
        return Promise.all([lmoFilepathToBuffer(LMO_FILEPATH)
            .then(lmoBufferToEntriesWrapper)
            .then(lmoEntriesToMSGIDPO),
        lmoFilepathToBuffer(LMO_SECOND_FILEPATH)
            .then(lmoBufferToEntriesWrapper)
            .then(lmoEntriesToMSGSTRPO)])
            .then(poEntriesPartsToPOEntries)
            // .then(function(lmoIDEntries, lmoSTREntries) {
            //     return lmoIDEntries;
            // })
            // .then(lmoEntriesToMSGIDPO)
            // .then(function(poEntries){
            //     return poEntries.join(LINE_BREAK + LINE_BREAK);
            // })
            .then(poEntriesToPO)
            .then(console.log);
    }
}

cli();
