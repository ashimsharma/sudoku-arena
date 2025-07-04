import { createSlice } from '@reduxjs/toolkit';

type CurrentGameStateData = {
	digit: number | null;
	isOnCorrectPosition: boolean;
	canBeTyped: boolean;
}

type EmojiReactions = {
	id: number;
	label: string;
	emoji: string;
};

interface InitialState {
    gameId: null | string
    me: null | Object
    opponent: null | Object
    meType: null | string
    initialGameState: (CurrentGameStateData)[]
    currentGameState: (CurrentGameStateData)[]
    meProgress: number
    opponentProgress: number
    totalMistakes: number
    opponentMistakes: number
    startTime: number
    gameDuration: number
    yourTimeTaken: number
    opponentTimeTaken: number
    winner: string
    gameEndReason: string
    emojiReactions: EmojiReactions[]
}

const initialState: InitialState = {
    gameId: null,
    me: null,
    opponent: null,
    meType: '',
    initialGameState: [],
    currentGameState: [],
    meProgress: 0,
    opponentProgress: 0,
    totalMistakes: 0,
    opponentMistakes: 0,
    startTime: 0,
    gameDuration: 0,
    yourTimeTaken: 0,
    opponentTimeTaken: 0,
    winner: "",
    gameEndReason: "",
    emojiReactions: []
}

const gameSlice = createSlice({
    name: 'game',
    initialState,
    reducers: {
        setGameId: (state, action) => {
            state.gameId = action.payload.gameId;
        },
        setMe: (state, action) => {
            state.me = action.payload.me;
        },
        setOpponent: (state, action) => {
            state.opponent = action.payload.opponent;
        },
        setMeType: (state, action) => {
            state.meType = action.payload.meType;
        },
        setInitialGameState: (state, action) => {
            state.initialGameState = action.payload.initialGameState;
        },
        setCurrentGameState: (state, action) => {
            state.currentGameState = action.payload.currentGameState;
        },
        setMeProgress: (state, action) => {
            state.meProgress = action.payload.meProgress;
        },
        setOpponentProgress: (state, action) => {
            state.opponentProgress = action.payload.opponentProgress;
        },
        setTotalMistakes: (state, action) => {
            state.totalMistakes = action.payload.totalMistakes;
        },
        setOpponentMistakes: (state, action) => {
            state.opponentMistakes = action.payload.opponentMistakes;
        },
        setStartTime: (state, action) => {
            state.startTime = action.payload.startTime;
        },
        setGameDuration: (state, action) => {
            state.gameDuration = action.payload.gameDuration;
        },
        setYourTimeTaken: (state, action) => {
            state.yourTimeTaken = action.payload.yourTimeTaken;
        },
        setOpponentTimeTaken: (state, action) => {
            state.opponentTimeTaken = action.payload.opponentTimeTaken;
        },
        setWinner: (state, action) => {
            state.winner = action.payload.winner;
        },
        setGameEndReason: (state, action) => {
            state.gameEndReason = action.payload.gameEndReason;
        },
        setEmojiReactions: (state, action) => {
            state.emojiReactions = action.payload.emojiReactions;
        }
    },
});

export const { setGameId, setMe, setOpponent, setMeType, setInitialGameState, setCurrentGameState, setMeProgress, setOpponentProgress, setTotalMistakes, setOpponentMistakes, setStartTime, setYourTimeTaken, setOpponentTimeTaken, setWinner, setGameEndReason, setGameDuration, setEmojiReactions } = gameSlice.actions;
export default gameSlice.reducer;