const http  = require('http');
const fs    = require('fs');
const { Server } = require("socket.io");
const { emit } = require('process');

const listener = function (req, res) {
    if (req.url === "/" || req.url == "/home" || req.url == "/editor") {
        req.url = "/index.html";

        // prevent caching of the editor, as it breaks it in firefox and possibly other browsers.
        res.setHeader("Cache-Control", "no-store, must-revalidate");
    }
    fs.readFile(__dirname.replace(/(\\|\/)server/g, "") + "/public" + req.url.replace(/(\\|\/)server/g, ""), function (err,data) {
        console.log("Page Request: " + req.url.replace(/\\server/g, ""));
        // 404
        if (err) {
            console.log('Error fulfilling request (returned 404)');
            console.warn(err);
            res.setHeader("Content-Type", "text/html");
            if (req.url !== "/404" && req.url !== "/404.html") {
                res.writeHead(404);
            } else {
                res.writeHead(200);
            }
            res.end(`
                <!DOCTYPE html>
                <html>
                <head>
                    <link rel="stylesheet" href="/main.css">
                </head>
                <body>
                    <div class="main">
                        <div class="other-players">
                            <span>
                                ${req.url == "/404" || req.url == "/404.html" ? "200" : "404"}: '${req.url}' ${req.url == "/404" || req.url == "/404.html" ? "" : "Not"} Found.
                            </span>
                        </div>
                        <div class="deck">
                            <h2>Your Cards</h2>
                            <div class="card-row">
                                <span color="green" inactive>4</span>
                                <span color="red" inactive>0</span>
                                <span color="blue" inactive>4</span>
                                <span color="wild">
                                    <svg fill="currentColor" class="bi bi-x-diamond-fill" viewBox="0 0 16 16" xmlns:svg="http://www.w3.org/2000/svg">
                                    <path style="fill:#00cc00;fill-opacity:1" d="M 3.34,11.954 7.292,8 3.339,4.046 0.435,6.951 c -0.58,0.58 -0.58,1.519 0,2.098 l 2.904,2.905 z" id="path1021"/>
                                    <path style="fill:#ffcc00;fill-opacity:1" d="M 11.954,12.66 8,8.708 4.046,12.662 6.951,15.566 c 0.58,0.58 1.519,0.58 2.098,0 l 2.905,-2.904 z" id="path1019"/>
                                    <path style="fill:#6688ff;fill-opacity:1" d="M 12.66,4.046 8.708,8 l 3.954,3.954 2.904,-2.905 c 0.58,-0.58 0.58,-1.519 0,-2.098 L 12.662,4.046 Z" id="path1017"/>
                                    <path style="fill:#ff2222;fill-opacity:1" d="m 9.05,0.435 c -0.58,-0.58 -1.52,-0.58 -2.1,0 L 4.047,3.339 8,7.293 11.954,3.339 9.049,0.435 Z" id="path2"/>
                                    </svg>
                                    Home
                                </span>
                            </div>
                        </div>
                    </div>
                    <script>
                        document.querySelector("span[color=wild]").addEventListener("click", () => {
                            window.location.href = "/";
                        })
                    </script>
                </body>
                </html>
            `);
            return;
        }

        if (req.url.endsWith(".js")) {
            res.setHeader("Content-Type", "application/javascript");
        } else if (req.url.endsWith(".json")) {
            res.setHeader("Content-Type", "application/json");
        } else if (req.url.endsWith(".css")) {
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.setHeader("Content-Type", "text/css");
        } else if (req.url.endsWith(".png")) {
            res.setHeader("Content-Type", "image/png");
        } else if (req.url.endsWith(".svg")) {
            res.setHeader("Content-Type", "image/svg+xml");
        } else if (req.url.endsWith(".jpeg")) {
            res.setHeader("Content-Type", "image/jpeg");
        } else {
            res.setHeader("Content-Type", "text/html");
        }
        res.writeHead(200);
        res.end(data);
    });
}

const logVerbosity = (process.argv[3] || 10) * 1;
let debugLog = (message, level) => {
    if (logVerbosity >= level) {
        console.log(`LL${level}: ${message}`);
    }
}

const server = http.createServer(listener);
const io = new Server(server);

// [0-9] = number, [10] = skip, [11] = reverse, [12] = draw two
const colorCardsTemplate = [1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2];
const templateDeck =  {
        // Keep track of how many of each card exists
        "red": colorCardsTemplate,
        "yellow": colorCardsTemplate,
        "green": colorCardsTemplate,
        "blue": colorCardsTemplate,
        "wild": [4, 4],
        "total": 108
};

const randomString = (length) => {
    return Math.round((Math.pow(36, length + 1) - Math.random() * Math.pow(36, length))).toString(36).slice(1);
}

let randomIntInRange = (min, max) => {
    return Math.floor(Math.random() * (max - min) + min);
}
function Player(socket) {
    this.socket = socket;
    this.name = "";
    this.connected = true;
    this.hand = [];
    this.unoTimer = 0;
    this.send = (message, content) => {
        this.socket.emit(message, content);
    }
    this.getCard = (index) => {
        return {
            color: hand[index].replace(/[0-9]/g, ""),
            number: hand[index].replace(/[^0-9]/g, "") * 1
        }
    }
}
function Game(code) {
    // copy the template game
    this.code = code;
    this.deck = {};

    this.rules = {
        drawToMatch: false,
        mustPlayMatch: false,
        stackDrawCards: false,
        noEndOnWilds: false
    };

    this.onShuffle = () => {};
    this.shuffle = () => {
        this.deck = JSON.parse(JSON.stringify(templateDeck));
        debugLog('Game: Shuffled deck', 3);
        this.onShuffle();
    }
    this.shuffle();
    this.draw = () => {
        const random = randomIntInRange(0, 107);
        let color = "";
        let number = 0;
        // There are 25 total cards of each color
        if (random <= 24) {
            color = "red";
            // account for only one zero of each color
            number = Math.ceil(random /2);
        } else if (random <= 49) {
            color = "yellow";
            // Subtract 25 because one result should be zero
            number = Math.ceil((random-25) /2);
        } else if (random <= 74) {
            color = "green";
            number = Math.ceil((random-50) /2);
        } else if (random <= 99) {
            color = "blue"
            number = Math.ceil((random-75) /2);
        } else {
            color = "wild";
            // Four of the wilds are draw fours
            number = random > 103 ? 1 : 0;
        }
        if (this.deck[color][number] > 0) {
            this.deck[color][number] -= 1;
            this.deck.total -= 1;
            debugLog(`Game: Player drew card ${color}${number}`, 3);
            return color + number;
        } else {
            // Once there's a somewhat low number of cards, refill the deck
            if (this.deck.total < 30) {
                this.shuffle();
                // remove cards that are in player hands or are the top card of the discard pile
                this.check();
            }
            return this.draw();
        }
    }
    this.parseCard = (string) => {
        return {
            color: string.replace(/[0-9].*/g, ""),
            number: string.replace(/[^0-9]/g, "") * 1
        }
    }

    this.topCard = this.draw();
    // Don't start with special cards
    while (this.parseCard(this.topCard).color === 'wild' || this.parseCard(this.topCard).number >= 10) {
        this.shuffle();
        this.topCard = this.draw();
    }

    this.currentPlayer = 0;
    this.currentPlayerDrew = false;
    this.playDirection = 1;
    this.players = [];
    this.drawStack = {
        amount: 0,
        wilds: false
    };

    this.getPlayers = () => {
        let out = [];
        for (const player of this.players) {
            out.push({
                name: player.name,
                hand: player.hand.length,
                connected: player.connected,
                unoTimer: player.unoTimer
            });
        }
        return out;
    }
    this.newPlayer = (player) => {
        for (let i = 0; i < 7; i++) {
            player.hand.push(this.draw());
        }
        this.players.push(player);
        this.send('set players', this.getPlayers());
        debugLog('Game: Added new player', 4);
    }
    this.check = () => {
        for (const player in this.players) {
            console.log(player.hand);
            for (const c of player.hand) {
                const card = this.parseCard(c);
                this.deck[card.color][card.number] -= 1;
            }
        }
        const tc = this.parseCard(this.topCard);
        this.deck[tc.color][tc.number] -= 1;
    }
    this.send = (message, content) => {
        debugLog(`Game: Sent message ${message} to players`, 5);
        for (const player of this.players) {
            player.socket.emit(message, content);
        }
    }

    this.canAdmit = (player) => {
        for (const p of this.players) {
            // loose comparison on purpose, just to be sure.
            if (p.name == player.name) {
                return false;
            }
        }
        return true;
    }
    this.nextPlayer = (static) => {
        const prev = this.currentPlayer;
        this.currentPlayer += this.playDirection;
        // loop around once you reach the end of the players array
        if (this.currentPlayer < 0) { this.currentPlayer = this.players.length - 1; }
        else if (this.currentPlayer >= this.players.length) { this.currentPlayer = 0; }

        const set = this.currentPlayer;
        if (static) this.currentPlayer = prev;
        else debugLog('Game: Moved to next player', 3);
        return set;
    }
    this.advance = () => {
        
        if (this.players[this.currentPlayer].hand.length === 1) {
            console.log('player has uno');
            this.players[this.currentPlayer].unoTimer = Date.now();
            this.send('set players', this.getPlayers());
        } else if (this.players[this.currentPlayer].hand.length === 0) {
            this.send('player won', this.players[this.currentPlayer].name);
            this.send('set players', this.getPlayers());
            this.players[0].socket.emit('show restart');
        }

        else debugLog('Game: Advancing to next player', 2);
        this.nextPlayer();


        // Skip disconnected players
        if (this.players[this.currentPlayer].disconnected) {
            this.advance();

        } else {
            this.currentPlayerDrew = false;
            this.send('current player', this.currentPlayer);
        }

    }
    this.isPlayersTurn = (player) => {
        if (this.players[this.currentPlayer].name == player.name) {
            return true;
        }
        return false;
    }

    this.doesCardMatch = (card) => {
        const top = this.parseCard(this.topCard);
        const played = this.parseCard(card);
        // wild cards can always be played
        if (card.startsWith('wild')) return true;
        // normal cards on top of normal cards
        if (played.color === top.color || played.number === top.number) return true;
        // when played on a wild card
        if (top.color === 'wild' && this.topCard.endsWith(played.color)) return true;

        return false;
    }

    this.voluntarySkip = (player) => {
        // You can't just skip someone else's turn
        if (!this.isPlayersTurn(player)) {
            debugLog('Game: Player tried to v-skip on others turn', 3);
            return;
        }

        // If the game rules prohibit it
        if ((this.rules.drawToMatch || this.rules.mustPlayMatch) && !this.drawStack.amount) {
            debugLog('Game: Player tried to v-skip with gamerules that prohibit it', 3);
            return false;
        }

        // If there's a card stack
        if (this.rules.stackDrawCards && this.drawStack.amount) {
            debugLog('Game: Player v-skipped when there was a stack', 3);

            for (let i = 0; i < this.drawStack.amount; i++) {
                player.hand.push(this.draw());
            }

            this.drawStack.amount = 0;
            this.drawStack.wilds = false;

            player.socket.emit('cards', player.hand);
            this.send('draw stack', this.drawStack);
            this.send('set players', this.getPlayers());
            this.send('set discard', this.topCard);
        }

        this.advance();
    }
    this.callUno = (player) => {
        debugLog('Game: Player attempted uno call', 4);

        if (player.unoTimer) {
            player.unoTimer = 0;

            this.send('set players', this.getPlayers());
            debugLog('Game: Player called uno on self', 3);
        } else {
            for (let pl of this.players) {
                // two seconds of grace
                if (pl.unoTimer &&
                    Date.now() - pl.unoTimer > 2000) {

                    debugLog('Game: Player called uno on other player', 3);
                        
                    pl.unoTimer = 0;
                    // draw two as penalty
                    pl.hand.push(this.draw());
                    pl.hand.push(this.draw());

                    pl.send('cards', pl.hand);
                    this.send('set players', this.getPlayers());
                }
            }
        }
    }

    this.play = (player, card) => {
        if (!this.isPlayersTurn(player)) {
            debugLog('Game: Player tried to play when not their turn', 3);
            return;
        }
        // don't allow playing with only one player
        if (this.players.length < 2) {
            debugLog('Game: Player tried to play but has no friends', 3);
            return;
        }

        const top = this.parseCard(this.topCard);
        let played = this.parseCard(card);
        if (card.startsWith('wild')) {
            played = {
                color: 'wild',
                number: played.number
            }
        } else if (this.topCard.startsWith('wild')) {
            if (!this.topCard.endsWith(played.color)) {
                // You must play cards that match the wild card's color
                debugLog('Game: Player tried to play non-matching card (on wild)', 3);
                return;
            }
        } else if (top.color !== played.color && top.number !== played.number) {
            // You must play cards that match either color or number
            debugLog('Game: Player tried to play non-matching card', 3);
            return;
        }

        const index = player.hand.indexOf(card.replace(/[0-9].*/g, "") + played.number);
        if (index < 0) {
            // You have to have the card to play it
            debugLog('Game: Player tried to play a card they don\'t have', 3);
            return;
        }

        /* Card Actions */
        if (!this.drawStack.amount) {

            // skips = 10
            if (played.number === 10) {
                this.nextPlayer();

            // reverses = 11
            } else if (played.number === 11) {
                this.playDirection *= -1;

            // draw twos = 12
            } else if (played.number === 12) {
                // this.nextPlayer(true) doesn't skip the next player
                // incase a stack is started
                let target = this.players[this.nextPlayer(true)];
    
                                            // Don't start a stack with a disconnected player
                if (this.rules.stackDrawCards && target.connected) {
                    this.drawStack.amount = 2;
                    this.drawStack.wilds = false;
                    this.send('draw stack', this.drawStack);
    
                } else {
                    // If the game doesn't have stacking enabled, just deal the cards
                    this.nextPlayer();
    
                    target.hand.push(this.draw());
                    target.hand.push(this.draw());
                    target.socket.emit('cards', target.hand);
                }

            // Draw fours
            } else if (played.color === 'wild' && played.number === 1) {
                let target = this.players[this.nextPlayer(true)];
                
                if (this.rules.stackDrawCards && target.connected) {
                    
                    this.drawStack.amount = 4;
                    this.drawStack.wilds = true;
                    this.send('draw stack', this.drawStack);

                } else {
                    this.nextPlayer();

                    target.hand.push(this.draw());
                    target.hand.push(this.draw());
                    target.hand.push(this.draw());
                    target.hand.push(this.draw());
                    target.socket.emit('cards', target.hand);
                }
            }
        } else if (this.rules.stackDrawCards) {
            // The player wants to add a +2 to the stack
            if (played.number === 12) {
                // this.nextPlayer(true) doesn't skip the next player
                // Because sometimes you can stack + cards
                let target = this.players[this.nextPlayer(true)];
    
                if(!this.drawStack.wilds) {
                    this.drawStack.amount += 2;
                    this.send('draw stack', this.drawStack);

                    if (!target.connected) {
                        target.hand.push(this.draw());
                        target.hand.push(this.draw());
                        // Emit even if they're not connected,
                        // socket.io will handle it properly
                        target.socket.emit('cards', target.hand);
                    } else {
                        this.nextPlayer();
        
                        target.hand.push(this.draw());
                        target.hand.push(this.draw());
                        target.socket.emit('cards', target.hand);
                    }

                // You can't add +2s to a stack with *4s
                } else {
                    return;
                }
            
            // Adding +4s to the stack
            } else if (played.color === 'wild' && played.number === 1) {
                let target = this.players[this.nextPlayer(true)];

                if(this.drawStack.amount % 4 === 0) {
                    this.drawStack.amount += 4;
                    this.drawStack.wilds = true;
                    this.send('draw stack', this.drawStack);

                    if (!target.connected) {
                        this.nextPlayer();
        
                        target.hand.push(this.draw());
                        target.hand.push(this.draw());
                        target.hand.push(this.draw());
                        target.hand.push(this.draw());
                        target.socket.emit('cards', target.hand);
                    }
                
                // Don't add to stacks not divisible by 4
                } else {
                    return;
                }

            // You can only play wilds and +2s on a stack
            } else {
                return;
            }
        }
        
        debugLog(`Game: Player played ${card} on ${this.topCard}`, 3);

        this.topCard = card;
        player.hand.splice(index, 1);

        if (player.hand.length === 0
            && this.rules.noEndOnWilds
            && played.color === 'wild') {
            // Add another card if you're not allowed to go out on wilds
            debugLog(`Game: Player tried to go out with a wild in a prohibited gamemode`, 3);
            player.hand.push(this.draw());
        }

        player.send('cards', player.hand);

        this.send('set players', this.getPlayers());
        this.send('set discard', this.topCard);

        this.advance();
    }
    this.drawFor = (player) => {
        if (!this.isPlayersTurn(player)){
            debugLog(`Game: Player tried to draw when it wasn't their turn`, 3);
            return;
        }

        // If it's not draw to match, only draw once
        if (this.currentPlayerDrew == true && !this.rules.drawToMatch) {
            debugLog(`Game: Player tried to draw multiple times w/o drawToMatch enabled`, 3);
            return;
        }
        // You can't draw cards when there's a stack
        if (this.drawStack.amount) {
            debugLog(`Game: Player tried to draw cards when cards were stacked`, 3);
            return;
        }

        // If players must play matches 
        if (this.rules.mustPlayMatch) {
            for (const card of player.hand) {
                // And the player can play a card, don't let them draw
                if (this.doesCardMatch(card)) {
                    debugLog(`Game: Player tried to draw cards but had a match w/ mustPlayMatch enabled`, 3);
                    return;
                }
            }
        }

        this.currentPlayerDrew = true;

        const card = this.draw();
        player.hand.push(card);

        debugLog(`Game: Player drew ${card}`, 3);

        player.send('cards', player.hand);
        this.send('set players', this.getPlayers());
        
        // If you can only draw once
        if (!this.rules.drawToMatch) {
            let canPlay = false;
            // check if the player can play any cards
            for (const card of player.hand) {
                if (this.doesCardMatch(card)) {
                    canPlay = true;
                }
            }
            if (!canPlay) {
                // if they can't, advance
                this.advance();
            }
        }

    }

    this.restart = () => {
        this.drawStack.amount = 0;
        this.drawStack.wilds = 0;
        this.currentPlayer = 0;
        this.playDirection = 1;

        this.shuffle();

        this.topCard = this.draw();
        // Don't start with special cards
        while (this.parseCard(this.topCard).color === 'wild' || this.parseCard(this.topCard).number >= 10) {
            this.shuffle();
            this.topCard = this.draw();
        }
            
        this.send('rules', this.rules);
        this.send('set discard', this.topCard);
        this.send('begin game', this.code);
        this.send('current player', this.currentPlayer);
        
        for (let player of this.players) {
            for (let i = 0; i < 7; i++) {
                player.hand.push(this.draw());
            }
            player.unoTimer = 0;
            player.socket.emit('cards', player.hand);
        }

        debugLog(`Game: Restarted game`, 3);

        this.send('set players', this.getPlayers());
    }
}

let activeGames = {};

let initiateNewPlayer = (player, game) => {
    player.socket.emit('rules', game.rules);
    player.socket.emit('cards', player.hand);
    player.socket.emit('set discard', game.topCard);
    player.socket.emit('begin game', game.code);
    player.socket.emit('current player', game.currentPlayer);
}

io.on('connection', (socket) => {
    debugLog('Game: User connected', 1);
    let player = new Player(socket);
    let currentGame;

    const check = (emit) => {
        if (!currentGame) {
            if (emit) {
                socket.emit('game poofed');
            }
            return false;
        }
        return true;
    }

    /* Connection */

    socket.on('disconnect', () => {
        player.connected = false;

        if (check()) {
            currentGame.send('set players', currentGame.getPlayers());
            if (currentGame.code && currentGame.players.length === 0) {
                delete activeGames[currentGame.code];
                currentGame = {};
                debugLog('Game: Game removed (all players disconnected)', 1);
            }
            debugLog('Game: User marked as disconnected', 1);
        }

        debugLog('Game: User disconected', 3);
    });
    socket.on('set name', (name) => {
        debugLog('Game: User set name', 4);
        player.name = name;
        socket.emit('ack name', name);
    });

    /* Game management */

    socket.on('join game', (code) => {
        code = code.toUpperCase();
        if (activeGames[code] && activeGames[code].canAdmit(player)) {
            activeGames[code].newPlayer(player);
            currentGame = activeGames[code];
            initiateNewPlayer(player, currentGame);
            debugLog('Game: User joined game: ' + code, 2);

        } else if (activeGames[code]) {
            // try to reconnect .. maybe they were disconnected.
            for (const existingPlayer of activeGames[code].players) {
                // Don't allow comandeering of connecting players
                // only reconnect as a player of the same name
                if (existingPlayer.connected === false && existingPlayer.name === player.name) {
                    player = existingPlayer;
                    player.socket = socket;
                    player.connected = true;
                    currentGame = activeGames[code];

                    // Alert players the player is back online
                    currentGame.send('set players', currentGame.getPlayers());

                    initiateNewPlayer(player, currentGame);
                    debugLog('Game: User rejoined game: ' + code, 2);
                    return;
                }
            }

            // Otherwise the name was taken by someone already online.
            socket.emit('name taken');

        } else {
            socket.emit('game not found');
        }
    });
    socket.on('new game', (rules) => {
        let code = randomString(6).toUpperCase();
        while (activeGames[code]) {
            console.warn("Game with code " + code + " already exists!");
            code = randomString(6).toUpperCase();
        }
        activeGames[code] = new Game(code);
        activeGames[code].newPlayer(player);
        currentGame = activeGames[code];
        currentGame.rules = rules;
        initiateNewPlayer(player, currentGame);
        debugLog('Game: User created new game: ' + code, 2);
    });

    /* Game actions */

    socket.on('play card', (card) => {
        if (check(true)) {
            currentGame.play(player, card);
        }
    });
    socket.on('draw card', () => {
        if (check(true)) {
            currentGame.drawFor(player);
        }
    });
    socket.on('skip turn', () => {
        if (check(true)) {
            currentGame.voluntarySkip(player);
        }
    });
    socket.on('call uno', () => {
        if (check(true)) {
            currentGame.callUno(player);
        }
    });
    socket.on('play again', () => {
        if (check(true)) {
            if (player.name === currentGame.players[0].name) {
                currentGame.restart();
            }
        }
    });
});

const port = process.env.PORT || process.argv[2] || 8080;

server.listen(port);
console.log("Server listening on port " + port );