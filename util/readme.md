# Overview
Import of a Q&A list of intents, queries(examples for an intent) and reponses into a Watson Assistant skill. There is 1-1 relationship between intent and response. Import overrides entire content of a skill with imported content. Skill has to exist prior to import.

# Configuration
Import is configurable:
* `locale`_config.json - configuration file dependent on language - e.g. `en_config.json`; Adjust this file for your language
* .`locale`_`environment`_env - environmental variables file - e.g. `.en_dev_env` - credentials for given language and environment (e.g. dev, test) - **imporant these files are set in `.gitignore` file in root project directory and should not be saved to git as the containt credenials and other developer/user dependent parameters**

# Input file
Import is taken from an excel file - see description of environmental variables below.

# Environment variables
Environment variables file (e.g. `.en_dev_env` has format defined in [here](https://github.com/motdotla/dotenv#usage))
* ASSISTANT_APIKEY - (required) assistant api key
* ASSISTANT_URL - (required) assistant api url
* SKILL_ID - (required) skill ID - previously workspace id
* ASSISTANT_LOAD_INTENTS_LIMIT - (optional) how many intents should be loaded from input file. If not set, or set to empty string, all intents are loaded 
* ASSISTANT_LOAD_SHEET_NAMES - (required) semicolon separated list of excel input file sheets - e.g. `LEGAL-input;MEDICAL-input;MOBILITY-input;SOCIAL-input`
* ASSISTANT_LOAD_COLUMN_NAMES - (required) semicolon separated list of column names containing data to be imported - e.g. `export-utterance;export-intent-description;export-intent;export-answer` this list must contain following elements:
    * Name of column containing user input examples for the intent
    * Name of column containing user label displayed for the dialog node
    * Name of column containing identifier for dialog and intent definitions
    * Name of column containing response returned by the assistant

# Running import

Import script reads following parameteres from the command line:

* `-l` `--locale` `<locale>` Environment configuration locale, e.g. 'en'
* `-e` `--environment` `<env>` Environment configuration type, e.g. 'dev'
* `-f` `--fileName` `<file>` Input file name (excel spreadsheet)

Running import from `util` folder:
```shell
node load.js -l ru -e dev -f 'answers_coronaBotRU.xlsx' 
```
