ko.extenders.numeric = function (target, precision) {
    //create a writeable computed observable to intercept writes to our observable
    var result = ko.computed({
        read: target,  //always return the original observables value
        write: function (newValue) {
            var current = target(),
                roundingMultiplier = Math.pow(10, precision),
                newValueAsNum = isNaN(newValue) ? 0 : parseFloat(+newValue),
                valueToWrite = Math.round(newValueAsNum * roundingMultiplier) / roundingMultiplier;

            //only write if it changed
            if (valueToWrite !== current) {
                target(valueToWrite);
            } else {
                //if the rounded value is the same, but a different value was written, force a notification for the current field
                if (newValue !== current) {
                    target.notifySubscribers(valueToWrite);
                }
            }
        }
    }).extend({ notify: 'always' });

    //initialize with current value to make sure it is rounded appropriately
    result(target());

    //return the new computed observable
    return result;
};

var BrainFuckInterpreter = function () {
    var self = this;

    self.strict = ko.observable(true);

    self.code = ko.observable('');
    self.stdin = ko.observable('');
    self.stdout = ko.observable('');
    self.data = ko.observableArray([{ value: ko.observable(0) }]);

    self.stdinIndex = ko.observable(0);

    self.codeIndex = ko.observable(0);
    self.dataIndex = ko.observable(0);

    self.state = ko.observable('Waiting for Run...');

    self.isRunning = ko.observable(false);
    var stopNext = false;

    self.stepByStep = ko.observable(false);
    self.stepByStepSpeed = ko.observable(250).extend({ numeric: 0 });

    self.codePositionColumn = ko.observable(0);
    self.codePositionRow = ko.observable(0);

    self.stepCount = ko.observable(0);

    var prev = function () {
        if (self.dataIndex() > 0) {
            self.dataIndex(self.dataIndex() - 1);
        }
    };

    var next = function () {
        self.dataIndex(self.dataIndex() + 1);

        if (self.dataIndex() >= self.data().length) {
            self.data.push({ value: ko.observable(0) });
        }
    };

    var increment = function () {
        var value = self.data()[self.dataIndex()].value() + 1;
        if (value < 256 || !self.strict()) {
            self.data()[self.dataIndex()].value(value);
        }
    };

    var decrement = function () {
        var value = self.data()[self.dataIndex()].value() - 1;
        if (value >= 0 || !self.strict()) {
            self.data()[self.dataIndex()].value(value);
        }
    };

    var start = function () {
        if (self.data()[self.dataIndex()].value() === 0) {
            //search for ] pair
            var count = 1;
            var index = self.codeIndex() + 1;
            var code = self.code();

            while (count > 0)
            {
                if (index < code.length) {
                    if (code[index] === '[') {
                        count++;
                    }
                    else if (code[index] === ']') {
                        count--;
                    }

                    if (count == 0) {
                        self.codeIndex(index);
                        updateCodePosition();
                        break;
                    }

                    index++;
                } else {
                    //error
                    log('Character \']\' not found.');
                    self.state('Error: character \']\' not found.');
                    stopNext = true;
                }
            }
        }
    };

    var end = function () {
        if (self.data()[self.dataIndex()].value() !== 0) {
            //search for [ pair
            var count = 1;
            var index = self.codeIndex() - 1;
            var code = self.code();

            while (count > 0) {
                if (index >= 0) {
                    if (code[index] === '[') {
                        count--;
                    }
                    else if (code[index] === ']') {
                        count++;
                    }

                    if (count == 0) {
                        //-1 needed to compensate the default +1
                        self.codeIndex(index - 1);
                        updateCodePosition(1);
                        break;
                    }

                    index--;
                } else {
                    //error
                    log('Character \'[\' not found.');
                    self.state('Error: character \'[\' not found.');
                    stopNext = true;
                }
            }
        }
    };

    var read = function () {
        if (self.stdinIndex() < self.stdin().length) {
            var value = self.stdin().charCodeAt(self.stdinIndex());

            if (value < 256 || !self.strict()) {
                self.data()[self.dataIndex()].value(value);
            }

            self.stdinIndex(self.stdinIndex() + 1);
        }
    };

    var write = function () {
        var value = self.data()[self.dataIndex()].value();

        if (value > 0) {
            self.stdout(self.stdout() + String.fromCharCode(value));
        }
    };

    var log = function (message) {
        self.stdout(self.stdout() + '\n' + message);
    };

    var nextStep = function () {
        if (stopNext) {
            self.state('Stopped.');
            self.isRunning(false);
            stopNext = false;
            return false;
        }

        var valid = false;
        var char = self.code()[self.codeIndex()];

        if (char == '\n') {
            self.codePositionRow(self.codePositionRow() + 1);
            self.codePositionColumn(0);
        } else {
            self.codePositionColumn(self.codePositionColumn() + 1);
        }

        switch (char) {
            case '<':
                prev();
                valid = true;
                break;
            case '>':
                next();
                valid = true;
                break;
            case '+':
                increment();
                valid = true;
                break;
            case '-':
                decrement();
                valid = true;
                break;
            case '[':
                start();
                valid = true;
                break;
            case ']':
                end();
                valid = true;
                break;
            case ',':
                read();
                valid = true;
                break;
            case '.':
                write();
                valid = true;
                break;
        }

        self.codeIndex(self.codeIndex() + 1);

        if (valid) {
            self.stepCount(self.stepCount() + 1);
        }

        if (self.codeIndex() < self.code().length) {
            if (stepping) {
            } else if (self.stepByStep()) {
                if (valid) {
                    setTimeout(function () { nextStep() }, self.stepByStepSpeed());
                } else {
                    setTimeout(function () { nextStep() }, self.stepByStepSpeed() / 5);
                }
            } else {
            }
            return true;
        } else {
            self.isRunning(false);
            self.state('Finished.');
            return false;
        }
    }

    var updateCodePosition = function (diff) {
        self.codePositionRow(0);
        self.codePositionColumn(0);

        var index = self.codeIndex() + (diff || 0);
        var char;
        var code = self.code();

        for (var i = 0; i < index; i++) {
            char = code[i];
            if (char == '\n') {
                self.codePositionRow(self.codePositionRow() + 1);
                self.codePositionColumn(0);
            } else {
                self.codePositionColumn(self.codePositionColumn() + 1);
            }
        }

    }

    self.start = function () {
        self.reset();

        self.run();
    }

    var runSteps = function () {
        var index = 0;
        while (nextStep()) {
            index++;
            if (index % 100 == 0) {
                setTimeout(function () {
                    runSteps();
                }, 1);
                break;
            }
        }
    }

    self.run = function () {
        self.isRunning(true);
        self.state('Running...');

        if (self.stepByStep()) {
            nextStep();
        } else {
            runSteps();
        }
    }

    self.reset = function () {
        //empty the data
        self.data([{ value: ko.observable(0) }]);
        self.dataIndex(0);
        self.stdinIndex(0);
        self.codeIndex(0);
        self.stdout('');
        self.codePositionColumn(0);
        self.codePositionRow(0);
        self.stepCount(0);
        stopNext = false;
    }

    self.stop = function () {
        stopNext = true;
        self.state('Stopping...');
    }

    self.pause = function () {
        stopNext = true;
        self.state('Pause...');
    }

    var stepping = false;

    self.step = function () {
        stopNext = false;
        stepping = true;
        self.state('Step');
        nextStep();
        stepping = false;
        stopNext = true;
    }
}