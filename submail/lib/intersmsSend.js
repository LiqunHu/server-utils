var Intersms = require('./intersms.js');

function IntersmsSend() {
    this.to = '';
    this.content = '';

    this.set_to = function(mob) {
        this.to = mob;
    };

    this.set_content = function(content) {
        this.content = content;
    };


    this.build_params = function() {
        var params = {};
        if (this.to != '') {
            params['to'] = this.to;
        }
        if(this.content != '') {
            params['content'] = this.content;
        }
        return params;
    };
    this.send = function() {
        var intersms = new Intersms();
        intersms.send(this.build_params());
    }
}

module.exports = IntersmsSend;