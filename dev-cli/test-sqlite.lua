local json = require("json");
local sqlite3 = require("sqlite3");


Handlers.add('init', Handlers.utils.hasMatchingTag('Action', 'Init'), function(msg, env)
    local db = sqlite3.open("my_database.db")
    db:exec("CREATE TABLE IF NOT EXISTS test (id INTEGER PRIMARY KEY, content TEXT)")
    db:close()
    ao.send(
        { Target = msg.From, Tags = { Name = Name, Ticker = Ticker, Logo = Logo, ProcessOwner = Owner, Denomination = tostring(Denomination), Controllers = json.encode(Controllers) } })
end)
