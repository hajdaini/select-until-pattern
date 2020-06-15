import * as vscode from 'vscode';
import { read } from 'fs';

let lastQuery = '';
var repeatNumber = 1;


/**
 * Return the indexOf string based on occurrence
 *  
 * @param {string} line 
 * @param {string} pattern 
 * @param {number} occurrenceNbr 
 * @param {boolean} reverse 
 * @param {boolean} ignoreCase
 * @return {number}
 */
function indexOfOccurrence(line: string, pattern: string, occurrenceNbr: number, reverse: boolean = false, ignoreCase: boolean = false) {
    if(ignoreCase){
        line = line.toLocaleLowerCase();
        pattern = pattern.toLocaleLowerCase();
    }
    if (reverse) {
        var tmp = 0;
        for (var o = 1; o <= occurrenceNbr; o++) {
            if (o == 1) {
                tmp = line.lastIndexOf(pattern);
            } else {
                tmp = line.lastIndexOf(pattern, tmp - pattern.length);
            }
        }
        return tmp;
    } else {
        return line.split(pattern, occurrenceNbr).join(pattern).length;
    }
}


/**
 * Get the position of the pattern in the editor
 * 
 * @param {vscode.Position} editor
 * @param {string} text 
 * @param {string} pattern 
 * @param {boolean} reverse 
 * @param {boolean} isIgnoreCase
 * @param {boolean} isPatternInclude 
 * @return {vscode.Position | null}
 */
function getPatternPosition(
    currentCursor: vscode.Position,
    text: string,
    pattern: string,
    reverse: boolean = false,
    isIgnoreCase: boolean = false,
    isPatternInclude: boolean = false,
    isPatternNotInclude: boolean = false,
) {
    let lines = [];
    var endPosLine = 0;
    var endPosIndex = 0;
    var includeInSelectionConfig = false;
    var counter = 0;

    if (reverse) {
        lines = text.split('\n').reverse();
    } else {
        lines = text.split('\n');
    }

    if (isPatternInclude) {
        includeInSelectionConfig = true;
    }
    else if (isPatternNotInclude) {
        includeInSelectionConfig = false;
    } else {
        includeInSelectionConfig = vscode.workspace.getConfiguration('select-until-pattern').includePatternInSelection;
    }

    var maxFindOccurrence = (text.match(RegExp(pattern, "g")) || []).length;

    if (maxFindOccurrence < 1) {
        return null;
    }

    if (repeatNumber > maxFindOccurrence) {
        repeatNumber = maxFindOccurrence;
    }

    for (var l = 0; l < lines.length; l++) {
        var occurrenceNbr = (lines[l].match(RegExp(pattern, "g")) || []).length;
        if (occurrenceNbr > 0) {
            var diff = repeatNumber - counter;
            if (occurrenceNbr > diff) {
                var occurrenceNbr = diff;
            }

            var index = indexOfOccurrence(lines[l], pattern, occurrenceNbr, reverse, isIgnoreCase);

            endPosLine = reverse ? (currentCursor.line - l) : (currentCursor.line + l);
            if (reverse) {
                endPosIndex = index;
            } else {
                if (endPosLine == currentCursor.line) { // pattern in same line as cursor line
                    endPosIndex = index + currentCursor.character;
                } else {
                    endPosIndex = index;
                }
            }

            counter += occurrenceNbr;
            if (counter >= repeatNumber) {
                break;
            }
        }
    }
    if (reverse) {
        return new vscode.Position(endPosLine, (includeInSelectionConfig ? endPosIndex : endPosIndex + pattern.length));
    } else {
        return new vscode.Position(endPosLine, (includeInSelectionConfig ? endPosIndex + pattern.length : endPosIndex));
    }
}

    function deleteSelection(editor: vscode.TextEditor, allSelections: vscode.Selection[]) {
        editor.edit(builder => {
            allSelections.forEach(selection => {
                builder.replace(selection, "");
            });
        });
    }


    /**
     * Return text from start a begin Position to end position
     * 
     * @param {vscode.TextEditor} editor
     * @param {boolean} reverse 
     * @param {vscode.Position} startedSelection 
     * @return {string} 
     */
    function getTextRange(editor: vscode.TextEditor, reverse: boolean, startedSelection: vscode.Position) {

        if (reverse) {
            // var firstLine = editor.document.lineAt(startedSelection.line + 1);
            var lastLine = editor.document.lineAt(0);
            var textRange = new vscode.Range(startedSelection, lastLine.range.start);
        } else {
            var lastLine = editor.document.lineAt(editor.document.lineCount - 1);
            var textRange = new vscode.Range(startedSelection, lastLine.range.end);
        }

        return editor.document.getText(textRange);
    }

    /**
     * Select of the pattern
     * 
     * @param {vscode.TextEditor} editor
     * @param {string} input 
     * @param {boolean} isIgnoreCase 
     * @param {boolean} isDeleteSelection 
     * @param {boolean} isPatternInclude 
     */
    function findAndSelection(
        editor: vscode.TextEditor,
        input: string,
        reverse: boolean = false,
        isIgnoreCase: boolean = false,
        isDeleteSelection: boolean = false,
        isPatternInclude: boolean = false,
        isPatternNotInclude: boolean = false
    ) {
        var allSelections: vscode.Selection[] = [];
        var notFoundRepeat = 0;
        for (let i = 0; i < editor.selections.length; i++) {
            var currentCursor = editor.selections[i].active;
            var text = getTextRange(editor, reverse, currentCursor);
            var patternPosition = getPatternPosition(currentCursor, text, input, reverse, isIgnoreCase, isPatternInclude, isPatternNotInclude);

            if (patternPosition == null) {
                notFoundRepeat += 1;
            } else {
                if (reverse) {
                    allSelections.push(new vscode.Selection(currentCursor, patternPosition));
                } else {
                    allSelections.push(new vscode.Selection(patternPosition, currentCursor));
                }
            }
            
        }
        if(editor.selections.length >= notFoundRepeat){
            vscode.window.showErrorMessage(`Not found : ${input}`);
        }else{
            editor.selections = allSelections;
            if (isDeleteSelection) {
                deleteSelection(editor, allSelections);
            }
        }
    }


    /**
     * Manage the regex of the user input
     * 
     * @param {vscode.TextEditor} editor
     * @param {string} input
     * @return {void}
     */
    function handleRegex(editor: vscode.TextEditor, input: string) {
        var regex = input.match(/^(.*)\/+(.*)$/) || [""];
        var pattern = regex[1];
        var flag = regex[2];
        repeatNumber = 1;

        if (input.slice(input.length - 1) == '/') {
            pattern = pattern.substring(0, pattern.length - 1);
            findAndSelection(editor, pattern);
            return;
        }
        if (!pattern || !flag) {
            findAndSelection(editor, input);
            return;
        }

        var reverse = flag.includes("r");
        var ignoreCase = flag.includes("i");
        var isPatternInclude = flag.includes("c");
        var isPatternNotInclude = flag.includes("e");
        var isDeleteSelection = flag.includes("d");
        var findNumber = flag.match(/\d+/);

        if (findNumber) {
            repeatNumber = parseInt(findNumber[0], 10);
        }

        findAndSelection(editor, pattern, reverse, ignoreCase, isDeleteSelection, isPatternInclude, isPatternNotInclude);
    }


    /**
     * Manage the pattern section
     * 
     * @param {vscode.TextEditor} editor
     * @return {void}
     */
    async function handleSelection(editor: vscode.TextEditor) {
        var input = await getKeywordFromUser();
        var saveLastPattern = vscode.workspace.getConfiguration('select-until-pattern').saveLastPattern;
        if (!input) {
            return;
        }
        if (saveLastPattern) {
            lastQuery = input;
        }
        handleRegex(editor, input);
    }


    /**
     * Display the user input
     * 
     * @return {string}
     */
    function getKeywordFromUser() {
        return vscode.window.showInputBox({
            placeHolder: 'Syntax: "<pattern>/i" "<pattern>/ri"',
            value: lastQuery,
        });
    }


    export function activate(context: vscode.ExtensionContext) {
        let disposable = vscode.commands.registerCommand('extension.select-until-pattern', () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showErrorMessage(`Not Editor is opened`);
                return;
            }
            handleSelection(editor);
        });

        context.subscriptions.push(disposable);
    }

    export function deactivate() { }
