/*********************************************************************************
 *  Copyright 2020 IBM Corp. All Rights Reserved.
 *********************************************************************************/

const dotenv = require('dotenv');
const fs = require('fs');
const xlsx = require('xlsx');
const program = require('commander')
const AssistantV1 = require('ibm-watson/assistant/v1');
var dumper = require('dumper').dumper;

/*********************************************************************************
 *  Column order in the input file
 *********************************************************************************/

const EXAMPLES_COL = 0;
const DESCRIPTION_COL = 1;
const INTENT_COL = 2;
const ANSWER_COL = 3;

/*********************************************************************************
 *  Variables definition
 *********************************************************************************/

var locale;
var env;

var fileEncoding;
var configFileName;
var inputFileAnswersName;

var dataSheetNamesArray;
var inputColNamesArray;

var globalQuestionsHash={};
var globalIntentsHash={};

var intentsLimit;

var config;

// dialog_node attribute of previosu dialog in the hierarchy
var previousSibling;

var questionsCount = 0;

/*********************************************************************************
 *  Functions definition
 **********************************************************************************/

const init = function() {
	program
		.requiredOption('-l, --locale <locale>', 'Environment configuration locale, e.g. \'en\'')
		.requiredOption('-e, --environment <env>', 'Environment configuration type, e.g. \'dev\'')
		.requiredOption('-f, --fileName <file>', 'Input file name (excel spreadsheet)')

	program.parse(process.argv)
	locale = program.locale
	env = program.environment
	inputFileAnswersName = program.fileName

	configFileName = locale + '_config.json'
	fileEncoding = 'utf-8';
	previousSibling = 'welcome'

	var envFileName = '.' + locale + '_' + env + '_env';
	dotenv.config({path: envFileName})

	intentsLimit = process.env.ASSISTANT_LOAD_INTENTS_LIMIT;

	return Promise.all([
		requireEnvVariable('ASSISTANT_LOAD_SHEET_NAMES'),
		requireEnvVariable('ASSISTANT_LOAD_COLUMN_NAMES'),
		requireEnvVariable('ASSISTANT_APIKEY'),
		requireEnvVariable('ASSISTANT_URL'),
	])
	.then(() => {
		try {
			dataSheetNamesArray = process.env.ASSISTANT_LOAD_SHEET_NAMES.split(';')
		} catch(err){
			return Promise.reject(new Error('Error parsing ASSISTANT_LOAD_SHEET_NAMES environment variable: ' + err))
		}
		try {
			inputColNamesArray = process.env.ASSISTANT_LOAD_COLUMN_NAMES.split(';')
		} catch(err){
			return Promise.reject(new Error('Error parsing ASSISTANT_LOAD_COLUMN_NAMES environment variable: ' + err))
		}
	})
	.then(() => {
		var apikey=process.env.ASSISTANT_APIKEY
		var ass_url=process.env.ASSISTANT_URL
		var skillid=process.env.SKILL_ID

		console.log('ASSISTANT_APIKEY: "'+apikey+'"')
		console.log('ASSISTANT_URL: "'+ass_url+'"')
		console.log('SKILL_ID: "'+skillid+'"')

		assistant = new AssistantV1({
			version: '2020-02-05',
			iam_apikey: apikey,
			url: ass_url
		});
		skill = {
			workspace_id: skillid,
			intents: [],
			dialog_nodes: []
		};
	})
}

const requireEnvVariable = function(envVarName){
	if (process.env[envVarName] == null || process.env[envVarName] == undefined || process.env[envVarName].trim().length == 0){
		return Promise.reject(new Error(`Environment variable not defined: ${envVarName}`))
	}
	return Promise.resolve();
}

const findColumn = function(worksheet, colName) {
	for (let col = 0 ;; col++) {
		let cell = worksheet[xlsx.utils.encode_cell({c:col, r:0})]
		if (!cell) {
			return -1
		} else if (cell.v == colName) {
			return col
		}
	}
}

const processWorksheet = function(worksheet) {
	let colArray = []
	for (inputColName of inputColNamesArray) {
		let inputCol = findColumn(worksheet, inputColName)
		if (inputCol == -1) {
			throw "Column not found: " + inputColName
		}
		colArray.push(inputCol)
	}

	for (let row = 1 ;; row++) {
		if (intentsLimit && skill.dialog_nodes.length > intentsLimit) {
			break
		}
		let inputCell = worksheet[xlsx.utils.encode_cell({c:colArray[EXAMPLES_COL], r:row})]
		if (!inputCell || inputCell.v.trim().length == 0) {
			break
		}
		let descrCell = worksheet[xlsx.utils.encode_cell({c:colArray[DESCRIPTION_COL], r:row})]
		let intentCell = worksheet[xlsx.utils.encode_cell({c:colArray[INTENT_COL], r:row})]
		let answerCell = worksheet[xlsx.utils.encode_cell({c:colArray[ANSWER_COL], r:row})]
		let userInputExamples = inputCell.v.split('\r\n')
		let intentDescription = (descrCell ? descrCell.v : "")
		let intent = intentCell.v.trim()
		let answer = answerCell.v

		let intentObject={
			"Description":intentDescription,
			"Intent":intent,
			"Answer":answer
		}
		globalIntentsHash[intent]=intentObject;

		for (id in userInputExamples) {
			let questionExample = userInputExamples[id];
			globalQuestionsHash[questionExample] = intent;
		}

		console.log(intent,userInputExamples.length);
		questionsCount = questionsCount + userInputExamples.length;
	}

	for (id in globalIntentsHash) {
		let intentObject = globalIntentsHash[id];

		let questionsArray=[]
		for (question in globalQuestionsHash) {
			if (globalQuestionsHash[question]==intentObject["Intent"]) {
				questionsArray.push(question);
			}
		}
		addAnswerToSkill(intentObject["Intent"], intentObject["Description"], questionsArray,
		intentObject["Answer"], previousSibling);
		previousSibling = intentObject["Intent"];
	}
}

const processWorkbook = function(filePath) {
	var workbook = xlsx.readFile(filePath)
	for (sheetName of workbook.SheetNames) {
		if (dataSheetNamesArray.includes(sheetName)) {
			processWorksheet(workbook.Sheets[sheetName])
		}
	}
}

const readFile = function(filePath){
	return new Promise( (resolve, reject) => {
		fs.readFile(filePath, fileEncoding, (err, data) => {
			if (err) return reject(new Error(err));
			resolve(data);
		})
	})
}

const addWelcomeNodeToSkill = function(){
	var dialogNode = {
		dialog_node: 'welcome',
		conditions: 'welcome',
		output: {
			generic: []
		}
	}
	if (config.welcomeNode) dialogNode.output.generic.push(config.welcomeNode);
	skill.dialog_nodes.push(dialogNode)
}

const addIntentToSkill = function(intent, userInputExamples){
	let reg = new RegExp('[^\\w\\p{L}\\.-]|^sys-', 'u')
	if (reg.test(intent)) {
		throw "Incorrect intent name: " + intent
	}
	var examples = [];
	for(userInputExample of userInputExamples){
		var trimmed = userInputExample.trim();
		if (trimmed.length > 0) {
			if (examples.find(function(element) {
				return element.text.localeCompare(trimmed, undefined, { sensitivity: 'accent' }) === 0
			})) {
				throw "Duplicate example for intent " + intent+ ": " + trimmed
			}
			examples.push({text: trimmed})
			globalQuestionsHash[trimmed]=intent;
		}
	}
	skill.intents.push({intent: intent, examples: examples})
}

const addAnswerToSkill = function(intent, intentDescription, userInputExamples, answer, previousSibling){
	addIntentToSkill(intent, userInputExamples);
	var dialogNode = {
		dialog_node: intent,
		conditions: '#' + intent,
		user_label: intentDescription,
		output: {
			generic: [
				{
					response_type: 'text',
					values: [
						{
							text: answer
						}
					]
				}
			]
		},
		previous_sibling: previousSibling
	}

  if (intent=="Страны-с-эпидемией") {
		dialogNode.next_step = {
			behavior: "skip_user_input"
		}
	};

	if (intent=="Статистика") {
		dialogNode.next_step = {
			behavior: "skip_user_input"
		}
		dialogNode.context= {
			"world": null,
			"russia": null,
			"type_of_statistics": null
		}
	}


	skill.dialog_nodes.push(dialogNode)
}

addStatisticsNodeToSkill = function() {
	for (id in config.dialog_nodes) {
		//console.log(config.dialog_nodes[id]);
		var node = config.dialog_nodes[id];
		if(node.parent && node.parent=="##PARENT-NODE##") {
			node.parent="Статистика";
		}
		skill.dialog_nodes.push(node);
	}

}

const addAnythingelseNodeToSkill = function(){
	var dialogNode = {
		dialog_node: 'anything_else',
		conditions: 'anything_else',
		disambiguation_opt_out: true,
		output: {
			generic: [
				{
					response_type: 'text',
					values: [
						{
							text: config.anythingelseMessage
						}
					]
				}
			]
		},
		previous_sibling: previousSibling
	}
	skill.dialog_nodes.push(dialogNode)
}

const addSystemSettings = function(){
	skill.system_settings = config.systemSettings;
}

/*********************************************************************************
 *  Main functionality
 **********************************************************************************/

init()
.then(() => {
	return readFile(configFileName)
})
.then((fileContent) => {
	config = JSON.parse(fileContent)
	addWelcomeNodeToSkill();
	processWorkbook(inputFileAnswersName);
	addAnythingelseNodeToSkill();
	addSystemSettings();

	if (config.entities) skill.entities=config.entities;
	if (config.webhooks) skill.webhooks=config.webhooks;

	addStatisticsNodeToSkill();

	//console.log(JSON.stringify(skill, null, 2));
	console.log("Total number of questions: ",questionsCount);
	// console.log(JSON.stringify(skill, null, 2));
	// return {name: 'noload', workspace_id: 'none'}
	//console.log(skill);
	for (i in skill.dialog_nodes) {
		//	dumper(skill.dialog_nodes[i]);
	}

	return assistant.updateWorkspace(skill)
})
.then(result => {
	console.log(`load successfull to skill name = ${result.name}, skill id = ${result.workspace_id}` )
})
.catch((err) => (
	console.log(`error running load:`, err)
))
