"use strict";

const { createApp, nextTick } = Vue;

let socket = io();

const game = createApp({
    data() {
        return {
            gameCode: 'ABCDEF',
            inProgress: false,
            discardPile: {
                color: 'yellow',
                number: '0'
            },
            prevDiscard: {
                color: 'yellow',
                number: '0'
            },
            players: [{}],
            hand: [],
            selectWildColor: false,
            playingWildType: 0,
            currentPlayer: 0,
            name: '',
            alert: '',
            rules: {},
            stackedDrawCards: 0,
            allowSkipTurn: false,
            centerMessage: '...',
            playAgainButton: false
        }
    },
    mounted() {
        socket.on('begin game', (code) => {
            console.log('begin game');
            document.querySelector("#game").style.display = "flex";
            document.querySelector("#welcome").style.display = "none";
            if (this.players.length > 1) {
                this.inProgress = true;
            } else {
                this.inProgress = false;
                this.centerMessage = 'Waiting for more players ...';
            }
            this.playAgainButton = false;
            this.gameCode = code;
        });
        socket.on('rules', (rules) => {
            this.rules = rules;
        })
        socket.on('ack name', (name) => {
            this.name = name;
        })
        socket.on('set players', (players) => {
            this.players = players;
            if (this.players.length > 1) {
                this.inProgress = true;
            }
        });
        socket.on('cards', (hand) => {
            this.hand = [];
            for (const card of hand) {
                this.hand.push(this.parseCard(card));
            }
        });
        socket.on('set discard', (card) => {

            this.prevDiscard = this.discardPile;
            this.discardPile = this.parseCard(card);

            nextTick(() => {
                let discardPile = document.querySelector('.discard-pile.bloop');
                // It doesn't appear on some screens
                if (discardPile) {
                    discardPile.classList.remove('begin');
                    setTimeout(() => {
                        discardPile.classList.add('begin');
                    }, 10);
                }
            });
        });
        socket.on('draw stack', (stack) => {
            console.log(stack);
            this.stackedDrawCards = stack.amount;

            if (this.players[this.currentPlayer].name === this.name
                && this.stackedDrawCards.amount) {

                this.allowSkipTurn = true;
            }
        });
        socket.on('current player', (index) => {
            this.currentPlayer = index;
            
            if (this.players[index].name === this.name
                && this.stackedDrawCards.amount) {

                this.allowSkipTurn = true;

            } else {
                this.allowSkipTurn = false;
            }
        });
        socket.on('game poofed', () => {
            document.querySelector("#game").style.display = "none";
            document.querySelector("#welcome").style.display = "flex";
            // prevent multiple alerts before the previous is cleared
            if (!this.alert) {
                this.alert = 'The server lost your game.';
                alert(this.alert);
                this.alert = '';
            }
        });
        socket.on('player won', (name) => {
            this.centerMessage = name;
            this.selectWildColor = false;
            this.inProgress = false;
        });
        socket.on('show restart', () => {
            this.playAgainButton = true;
        });
    },
    computed: {
        isTurn() {
            return this.players[this.currentPlayer].name === this.name;
        },
        showUnoButton() {
            for (const player of this.players) {
                if (player.hand === 1 && player.unoTimer > 0) {
                    return true;
                }
            }
            return false;
        }
    },
    methods: {
        playCard(card) {
            if (card.color === 'wild') {
                this.playingWildType = card.number;
                this.selectWildColor = true;
            } else {
                this.selectWildColor = false;
                socket.emit('play card', card.color + card.number);
            }
        },
        drawCard() {
            socket.emit('draw card');
            // If the rules allow skipping turns
            if (!this.rules.drawToMatch && !this.rules.mustPlayMatch && this.isTurn) {
                this.allowSkipTurn = true;
            }
        },
        callUno() {
            socket.emit('call uno');
        },
        skipTurn() {
            socket.emit('skip turn');
        },
        playWild(color) {
            const card = 'wild' + this.playingWildType + color;
            socket.emit('play card', card);
            this.selectWildColor = false;
        },
        cardSymbol(card) {
            if (card.color === 'wild') {
                // Wild 0s are normal, and 1s are draw four
                return (card.number === 1 ? '+4' : 'W');
            } else if (card.number >= 10) {
                //          Skips are 10                Reverses are 11             Draw twos are 12    Else there's a problem
                return (card.number === 10 ? 'S' : (card.number === 11 ? 'R' : (card.number === 12 ? '+2' : '?')))
            } else {
                // 0-9 Are normal numbers
                return card.number;
            }
        },
        parseCard(card) {
            return {
                color: card.replace(/[0-9].*/g, ""),
                number: card.replace(/[^0-9]/g, "") * 1,
                wildColor: card.replace(/[a-z]+[0-1]/g, "")
            }
        },
        playAgain() {
            socket.emit('play again');
        }
    }
});
game.mount('#game');

const welcome = createApp({
    data() {
        return {
            namePlaceholder: 'Your Name',
            drawButtonText: 'Join',
            showDrawButton: false,
            showGameOptions: false,
            rules: {
                drawToMatch: false,
                mustPlayMatch: false,
                stackDrawCards: false,
                noEndOnWilds: false
            }
        }
    },
    mounted() {
        const input = document.querySelector("#name-code-input");

        socket.on('name taken', () => {
            this.showDrawButton = false;
            this.namePlaceholder = 'Name Taken';
            input.value = '';
            input.focus();
        });
        socket.on('game not found', () => {
            this.namePlaceholder = 'Invalid Code';
            input.value = '';
            input.focus();
        });
        socket.on('game poofed', () => {
            input.value = '';
            this.namePlaceholder = 'Your Name';
            this.showDrawButton = false;
        });
    },
    methods: {
        checkInput(input) {
            this.showGameOptions = false;

            if (input.value) {
                return true;
            } else {
                if (input.getAttribute('color') === 'yellow') {
                    input.setAttribute('color', 'red');
                } else {
                    input.setAttribute('color', 'yellow');
                }
                input.focus();
                return false;
            }
        },
        joinWithCode() {
            const input = document.querySelector("#name-code-input");
            if (this.checkInput(input)) {
                socket.emit('join game', input.value);
            }
        },
        joinGame() {
            const input = document.querySelector("#name-code-input");
            if (this.checkInput(input)) {
                socket.emit('set name', input.value);
                input.value = '';
                this.namePlaceholder = 'Enter Code';
                this.showDrawButton = 'True';
                input.focus();
            }
        },
        newGame() {
            const input = document.querySelector("#name-code-input");
            if (this.checkInput(input)) {
                socket.emit('set name', input.value);
                socket.emit('new game', this.rules);
            } else {
                this.namePlaceholder = 'Your Name';
                this.showDrawButton = false;
            }
        }
    }
});
welcome.mount("#welcome");

