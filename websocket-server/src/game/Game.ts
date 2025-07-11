import { WebSocket } from "ws";
import { prisma, GameStatus } from "../db/index";
import { connectionUserIds } from "../store/connections";
import { getSudoku } from "sudoku-gen";
import {
	BOTH_USERS_GAME_INITIATED,
	GAME_INITIATE_FAILED,
	GAME_INITIATED,
	OPPONENT_JOINED,
	ROOM_CREATE_FAILED,
	ROOM_CREATED,
	ROOM_JOIN_FAILED,
	ROOM_JOINED,
	WRONG_CELL,
	YOUR_MISTAKES_COMPLETE,
	OPPONENT_MISTAKES_COMPLETE,
	OPPONENT_MISTAKE,
	CORRECT_CELL,
	OPPONENT_CORRECT_CELL,
	BOARD_COMPELTE,
	ALREADY_ON_CORRECT_POSITION,
	CELL_CLEARED,
	OPPONENT_GAME_INITIATED,
	GAME_ENDED,
	GAME_ALREADY_ENDED,
	TIMER_COMPLETE,
	MISTAKES_COMPLETE,
	OPPONENT_REACTION,
	DATA_FETCHED,
	GAME_ALREADY_STARTED,
	GAME_NOT_STARTED,
} from "../messages/messages";

type Options = {
	difficulty: Difficulty;
	gameTime: number;
};

type EmojiReactions = {
	id: number;
	label: string;
	emoji: string;
};

type Difficulty = "easy" | "medium" | "hard" | "expert";

type CurrentGameStateData = {
	digit: number | null;
	isOnCorrectPosition: boolean;
	canBeTyped: boolean;
};

export class Game {
	public gameId?: string;
	private creator: {
		id: string;
		name: string;
		avatarUrl: string;
		type: string;
		socket: WebSocket;
		gameStarted: boolean;
		currentGameState: CurrentGameStateData[];
		mistakes: number;
		correctAdditions: 0;
		percentageComplete: number;
		timeTaken: number;
	};
	private joiner?: {
		id: string;
		name: string;
		avatarUrl: string;
		type: string;
		socket: WebSocket;
		gameStarted: boolean;
		currentGameState: CurrentGameStateData[];
		mistakes: number;
		correctAdditions: number;
		percentageComplete: number;
		timeTaken: number;
	};
	private options: Options;
	private initialGameState: CurrentGameStateData[] = [];
	private solution: number[] = [];
	private gameStarted: boolean = false;
	private emptyCells: number = 0;
	private readonly totalAllowedMistakes: number = 5;
	private startTime: number = 0;
	private timerEnded: boolean = false;
	private gameEnded: boolean = false;
	private readonly gameDuration: number = 0; // 600000 ms -> 10 minutes
	private readonly emojiReactions: EmojiReactions[] = [
		{ id: 1, label: "Big Brain", emoji: "🧠" },
		{ id: 2, label: "Close Call", emoji: "😅" },
		{ id: 3, label: "On Fire", emoji: "🔥" },
		{ id: 4, label: "Mind Blown", emoji: "🤯" },
		{ id: 5, label: "Well Played", emoji: "👏" },
		{ id: 6, label: "Too Slow", emoji: "🐢" },
		{ id: 7, label: "Victory!", emoji: "🥳" },
		{ id: 8, label: "Good Game", emoji: "🤝" },
		{ id: 9, label: "Oops!", emoji: "❌" },
	];

	constructor(creatingPlayer: WebSocket, params: any) {
		this.creator = {
			id: connectionUserIds.get(creatingPlayer),
			name: "",
			avatarUrl: "",
			type: "creator",
			socket: creatingPlayer,
			gameStarted: false,
			currentGameState: [],
			correctAdditions: 0,
			mistakes: 0,
			percentageComplete: 0,
			timeTaken: 0,
		};

		this.getCreator(connectionUserIds.get(creatingPlayer));

		// Delete it from the global map after creating the game user.
		connectionUserIds.delete(creatingPlayer);

		this.options = params;
		this.gameDuration = this.options.gameTime * 60 * 1000;
		this.createGameInDB();
	}

	async getCreator(id: string) {
		const creatorUser = await prisma.user.findFirst({
			where: {
				id,
			},
		});

		this.creator.name = creatorUser?.name as string;
		this.creator.avatarUrl = creatorUser?.avatarUrl as string;
	}
	async createGameInDB() {
		try {
			const createdGame = await prisma.game.create({
				data: {
					options: this.options,
					status: GameStatus.ACTIVE,
				},
			});

			this.gameId = createdGame.id;

			const createGamePlayer = await prisma.gamePlayer.create({
				data: {
					gameId: createdGame.id,
					userId: this.creator.id,
				},
			});

			this.creator.socket.send(
				JSON.stringify({ type: ROOM_CREATED, roomId: createdGame.id })
			);
		} catch (error) {
			this.creator.socket.send(
				JSON.stringify({ type: ROOM_CREATE_FAILED })
			);
		}
	}

	async addJoiningPlayerToDB() {
		try {
			await prisma.gamePlayer.create({
				data: {
					gameId: this.gameId as string,
					userId: this.joiner?.id as string,
				},
			});

			this.creator?.socket.send(
				JSON.stringify({
					type: OPPONENT_JOINED,
					data: {
						joinerId: this.joiner?.id,
						joinerName: this.joiner?.name,
						avatarUrl: this.joiner?.avatarUrl,
					},
				})
			);

			this.joiner?.socket.send(
				JSON.stringify({
					type: ROOM_JOINED,
					data: {
						roomId: this.gameId,
						creatorId: this.creator?.id,
						creatorName: this.creator?.name,
						avatarUrl: this.creator?.avatarUrl,
					},
				})
			);
		} catch (error) {
			this.joiner?.socket.send(
				JSON.stringify({ type: ROOM_JOIN_FAILED })
			);
		}
	}

	async joinGame(joiningPlayer: WebSocket) {
		if (connectionUserIds.get(joiningPlayer) === this.creator.id) {
			joiningPlayer.send(JSON.stringify({ type: ROOM_JOIN_FAILED }));
			return;
		}

		const joinerUser = await prisma.user.findFirst({
			where: {
				id: connectionUserIds.get(joiningPlayer),
			},
		});

		this.joiner = {
			id: connectionUserIds.get(joiningPlayer),
			name: joinerUser?.name as string,
			avatarUrl: joinerUser?.avatarUrl as string,
			type: "joiner",
			socket: joiningPlayer,
			gameStarted: false,
			currentGameState: [],
			mistakes: 0,
			percentageComplete: 0,
			correctAdditions: 0,
			timeTaken: 0,
		};

		connectionUserIds.delete(joiningPlayer);

		this.addJoiningPlayerToDB();
	}

	isInteger(str: string) {
		const num = parseInt(str, 10);
		return Number.isInteger(num) && num.toString() === str;
	}

	initGame(gameId: string, socket: WebSocket) {
		if (this.initialGameState.length === 0) {
			const sudoku = getSudoku(this.options.difficulty);
			this.initialGameState = sudoku.puzzle.split("").map((data) => {
				if (this.isInteger(data)) {
					return {
						digit: parseInt(data),
						isOnCorrectPosition: true,
						canBeTyped: false,
					};
				}
				this.emptyCells += 1;
				return {
					digit: null,
					isOnCorrectPosition: true,
					canBeTyped: true,
				};
			});
			this.solution = sudoku.solution
				.split("")
				.map((data) => parseInt(data));
		}

		if (this.creator.socket === socket) {
			this.creator.currentGameState = this.initialGameState.map(
				(cell) => ({ ...cell })
			);
			const gameCreated = this.initGameInDB(gameId, this.creator.id);
			if (!gameCreated) {
				socket.send(JSON.stringify({ type: GAME_INITIATE_FAILED }));
				return;
			}

			this.creator.gameStarted = true;

			this.creator?.gameStarted &&
				this.joiner?.gameStarted &&
				(this.gameStarted = true);

			if (!this.gameStarted) {
				socket.send(
					JSON.stringify({
						type: GAME_INITIATED,
					})
				);
			}

			this.joiner?.socket.send(
				JSON.stringify({
					type: OPPONENT_GAME_INITIATED,
				})
			);
		} else {
			this.joiner !== undefined &&
				(this.joiner.currentGameState = this.initialGameState.map(
					(cell) => ({ ...cell })
				));

			const gameCreated = this.initGameInDB(
				gameId,
				this.joiner?.id as string
			);
			if (!gameCreated) {
				socket.send(JSON.stringify({ type: GAME_INITIATE_FAILED }));
				return;
			}

			this.joiner && (this.joiner.gameStarted = true);
			this.creator?.gameStarted &&
				this.joiner?.gameStarted &&
				(this.gameStarted = true);

			if (!this.gameStarted) {
				socket.send(
					JSON.stringify({
						type: GAME_INITIATED,
					})
				);
			}

			this.creator.socket.send(
				JSON.stringify({
					type: OPPONENT_GAME_INITIATED,
				})
			);
		}

		if (this.gameStarted) {
			this.startTime = Date.now();

			this.creator?.socket.send(
				JSON.stringify({
					type: BOTH_USERS_GAME_INITIATED,
					data: {
						initialGameState: this.initialGameState,
						currentGameState: this.creator.currentGameState,
						startTime: this.startTime,
						gameDuration: this.gameDuration,
						reactions: this.emojiReactions,
					},
				})
			);
			this.joiner?.socket.send(
				JSON.stringify({
					type: BOTH_USERS_GAME_INITIATED,
					data: {
						initialGameState: this.initialGameState,
						currentGameState: this.joiner?.currentGameState,
						startTime: this.startTime,
						gameDuration: this.gameDuration,
						reactions: this.emojiReactions,
					},
				})
			);
		}
	}

	async initGameInDB(gameId: string, userId: string) {
		try {
			const user =
				userId === this.creator.id ? this.creator : this.joiner;

			await prisma.gamePlayer.update({
				where: {
					userId_gameId: {
						userId: userId,
						gameId: gameId,
					},
				},
				data: {
					gameData: {
						initialGameState: this.initialGameState,
						solution: this.solution,
						currentGameState: user?.currentGameState,
						mistakes: user?.mistakes,
						percentageComplete: user?.percentageComplete,
					},
				},
			});

			return true;
		} catch (error) {
			return false;
		}
	}

	async verifyValue(
		ws: WebSocket,
		userId: string,
		value: number,
		index: number
	) {
		try {
			if (this.initialGameState[index].digit !== null) {
				return;
			}

			const user =
				userId === this.creator.id ? this.creator : this.joiner;

			if (!user) {
				return;
			}

			if (this.gameEnded) {
				user?.socket.send(
					JSON.stringify({
						type: GAME_ALREADY_ENDED,
					})
				);
				return;
			}
			if (user.mistakes === this.totalAllowedMistakes) {
				user.socket.send(
					JSON.stringify({
						type: YOUR_MISTAKES_COMPLETE,
						currentGameState: user?.currentGameState,
						mistakes: user?.mistakes,
					})
				);
				return;
			}

			if (
				user.currentGameState[index].isOnCorrectPosition &&
				!user.currentGameState[index].canBeTyped
			) {
				user.socket.send(
					JSON.stringify({
						type: ALREADY_ON_CORRECT_POSITION,
					})
				);

				return;
			}

			if (!user.currentGameState[index].canBeTyped) {
				return;
			}

			user.currentGameState[index].digit = value;

			if (this.solution[index] !== value) {
				user.mistakes += 1;
				user.currentGameState[index].isOnCorrectPosition = false;
				if (user?.mistakes === this.totalAllowedMistakes) {
					user.socket.send(
						JSON.stringify({
							type: YOUR_MISTAKES_COMPLETE,
							currentGameState: user?.currentGameState,
							mistakes: user?.mistakes,
						})
					);

					this.endGame(user.id, MISTAKES_COMPLETE);
					return;
				} else {
					user?.socket.send(
						JSON.stringify({
							type: WRONG_CELL,
							currentGameState: user?.currentGameState,
							mistakes: user?.mistakes,
						})
					);
				}

				if (
					user?.type === "creator" &&
					user?.mistakes === this.totalAllowedMistakes
				) {
					this.joiner?.socket.send(
						JSON.stringify({
							type: OPPONENT_MISTAKES_COMPLETE,
							opponentMistakes: this.creator.mistakes,
						})
					);
				} else if (
					user?.type === "joiner" &&
					user?.mistakes === this.totalAllowedMistakes
				) {
					this.creator.socket.send(
						JSON.stringify({
							type: OPPONENT_MISTAKES_COMPLETE,
							opponentMistakes: this.joiner?.mistakes,
						})
					);
				} else if (
					user?.type === "creator" &&
					user?.mistakes < this.totalAllowedMistakes
				) {
					this.joiner?.socket.send(
						JSON.stringify({
							type: OPPONENT_MISTAKE,
							mistakes: this.creator?.mistakes,
						})
					);
				} else if (
					user?.type === "joiner" &&
					user?.mistakes < this.totalAllowedMistakes
				) {
					this.creator.socket.send(
						JSON.stringify({
							type: OPPONENT_MISTAKE,
							mistakes: this.joiner?.mistakes,
						})
					);
				}
				this.updateGameInDB(this.gameId as string, userId);
				return;
			}

			user.correctAdditions += 1;

			user.currentGameState[index].canBeTyped = false;
			user.currentGameState[index].isOnCorrectPosition = true;

			let correctAdditions =
				user !== undefined ? user?.correctAdditions : null;

			let percentageComplete = Math.round(
				((correctAdditions as number) / this.emptyCells) * 100
			);

			user.percentageComplete = percentageComplete;

			this.updateGameInDB(this.gameId as string, userId);

			const isComplete = this.checkIfBoardComplete(userId);

			if (isComplete) {
				this.endGame(userId, BOARD_COMPELTE);
				return;
			}

			user?.socket.send(
				JSON.stringify({
					type: CORRECT_CELL,
					percentageComplete,
					currentGameState: user?.currentGameState,
				})
			);

			if (user?.type === "creator") {
				this.joiner?.socket.send(
					JSON.stringify({
						type: OPPONENT_CORRECT_CELL,
						percentageComplete,
					})
				);
			} else {
				this.creator.socket.send(
					JSON.stringify({
						type: OPPONENT_CORRECT_CELL,
						percentageComplete,
					})
				);
			}
		} catch (error) {
			console.log(error);
		}
	}

	async updateGameInDB(gameId: string, userId: string) {
		try {
			const user =
				userId === this.creator.id ? this.creator : this.joiner;

			await prisma.gamePlayer.update({
				where: {
					userId_gameId: {
						userId: userId,
						gameId: gameId,
					},
				},
				data: {
					gameData: {
						initialGameState: this.initialGameState,
						solution: this.solution,
						currentGameState: user?.currentGameState,
						mistakes: user?.mistakes,
						percentageComplete: user?.percentageComplete,
					},
				},
			});

			return true;
		} catch (error) {
			return false;
		}
	}

	clearValue(userId: string, index: number) {
		const user = userId === this.creator.id ? this.creator : this.joiner;

		if (!user) {
			return;
		}

		if (
			user.currentGameState[index].isOnCorrectPosition &&
			!user.currentGameState[index].canBeTyped
		) {
			user.socket.send(
				JSON.stringify({
					type: ALREADY_ON_CORRECT_POSITION,
				})
			);

			return;
		}

		if (!user.currentGameState[index].digit) {
			return;
		}

		user.currentGameState[index].digit = null;
		user.currentGameState[index].canBeTyped = true;
		user.currentGameState[index].isOnCorrectPosition = true;

		this.updateGameInDB(this.gameId as string, userId);

		user.socket.send(
			JSON.stringify({
				type: CELL_CLEARED,
				currentGameState: user.currentGameState,
			})
		);
	}

	endGame(userId: string, gameEndReason: string) {
		const user = userId === this.creator.id ? this.creator : this.joiner;

		if (this.gameEnded) {
			user?.socket.send(
				JSON.stringify({
					type: GAME_ALREADY_ENDED,
				})
			);
			return;
		}

		this.gameEnded = true;

		if (!user) {
			return;
		}

		if (!this.joiner) {
			return;
		}

		this.creator.timeTaken = Date.now() - this.startTime;
		this.joiner.timeTaken = Date.now() - this.startTime;

		let opponent = user.type === "creator" ? this.joiner : this.creator;

		if (gameEndReason === MISTAKES_COMPLETE) {
			this.endGameInDB(opponent.id);
			user.socket.send(
				JSON.stringify({
					type: GAME_ENDED,
					result: {
						winner: opponent.type,
						yourPercentageComplete: user.percentageComplete,
						opponentPercentageComplete: opponent.percentageComplete,
						yourMistakes: user.mistakes,
						opponentMistakes: opponent.mistakes,
						yourTimeTaken: user.timeTaken,
						opponentTimeTaken: opponent.timeTaken,
						gameEndReason: gameEndReason,
					},
				})
			);

			opponent.socket.send(
				JSON.stringify({
					type: GAME_ENDED,
					result: {
						winner: opponent.type,
						yourPercentageComplete: opponent.percentageComplete,
						opponentPercentageComplete: user.percentageComplete,
						yourMistakes: opponent.mistakes,
						opponentMistakes: user.mistakes,
						yourTimeTaken: opponent.timeTaken,
						opponentTimeTaken: user.timeTaken,
						gameEndReason: gameEndReason,
					},
				})
			);
			return;
		}

		this.endGameInDB(userId);

		user.socket.send(
			JSON.stringify({
				type: GAME_ENDED,
				result: {
					winner: user.type,
					yourPercentageComplete: user.percentageComplete,
					opponentPercentageComplete: opponent.percentageComplete,
					yourMistakes: user.mistakes,
					opponentMistakes: opponent.mistakes,
					yourTimeTaken: user.timeTaken,
					opponentTimeTaken: opponent.timeTaken,
					gameEndReason: gameEndReason,
				},
			})
		);

		opponent.socket.send(
			JSON.stringify({
				type: GAME_ENDED,
				result: {
					winner: user.type,
					yourPercentageComplete: opponent.percentageComplete,
					opponentPercentageComplete: user.percentageComplete,
					yourMistakes: opponent.mistakes,
					opponentMistakes: user.mistakes,
					yourTimeTaken: opponent.timeTaken,
					opponentTimeTaken: user.timeTaken,
					gameEndReason: gameEndReason,
				},
			})
		);
	}

	async endGameInDB(userId: string) {
		try {
			const user =
				userId === this.creator.id ? this.creator : this.joiner;
			const opponent =
				userId === this.creator.id ? this.joiner : this.creator;

			const gameUpdated = await prisma.game.update({
				where: {
					id: this.gameId,
				},
				data: {
					winnerId: user?.id as string,
					status: GameStatus.COMPLETED,
					draw: false,
				},
			});

			if (!gameUpdated) {
				throw new Error("Game Update Failed.");
			}

			await prisma.user.update({
				where: {
					id: user?.id,
				},
				data: {
					noOfWins: {
						increment: 1,
					},
				},
			});

			await prisma.user.update({
				where: {
					id: opponent?.id,
				},
				data: {
					noOfLosses: {
						increment: 1,
					},
				},
			});
		} catch (error) {
			console.log(error);
		}
	}

	endTimer(userId: string) {
		const user = userId === this.creator.id ? this.creator : this.joiner;

		if (this.gameEnded) {
			user?.socket.send(
				JSON.stringify({
					type: GAME_ALREADY_ENDED,
				})
			);
			return;
		}

		this.timerEnded = true;
		this.gameEnded = true;

		if (!user) {
			return;
		}

		if (!this.joiner) {
			return;
		}

		this.creator.timeTaken = this.gameDuration;
		this.joiner.timeTaken = this.gameDuration;

		let winner =
			this.creator.percentageComplete > this.joiner?.percentageComplete
				? "creator"
				: "joiner";

		if (
			this.creator.percentageComplete === this.joiner?.percentageComplete
		) {
			if (this.creator.mistakes > this.joiner.mistakes) {
				winner = "joiner";
			} else if (this.creator.mistakes < this.joiner.mistakes) {
				winner = "creator";
			} else {
				winner = "draw";
			}
		}
		let opponent = user.type === "creator" ? this.joiner : this.creator;

		this.endTimerInDB(winner);

		user.socket.send(
			JSON.stringify({
				type: GAME_ENDED,
				result: {
					winner: winner,
					yourPercentageComplete: user.percentageComplete,
					opponentPercentageComplete: opponent.percentageComplete,
					yourMistakes: user.mistakes,
					opponentMistakes: opponent.mistakes,
					yourTimeTaken: user.timeTaken,
					opponentTimeTaken: opponent.timeTaken,
					gameEndReason: TIMER_COMPLETE,
				},
			})
		);

		opponent.socket.send(
			JSON.stringify({
				type: GAME_ENDED,
				result: {
					winner: winner,
					yourPercentageComplete: opponent.percentageComplete,
					opponentPercentageComplete: user.percentageComplete,
					yourMistakes: opponent.mistakes,
					opponentMistakes: user.mistakes,
					yourTimeTaken: opponent.timeTaken,
					opponentTimeTaken: user.timeTaken,
					gameEndReason: TIMER_COMPLETE,
				},
			})
		);
	}

	async endTimerInDB(winner: string) {
		try {
			if (winner === "draw") {
				const gameUpdated = await prisma.game.update({
					where: {
						id: this.gameId,
					},
					data: {
						draw: true,
						status: GameStatus.COMPLETED,
					},
				});

				if (!gameUpdated) {
					throw new Error("Game Update Failed.");
				}

				await prisma.user.update({
					where: {
						id: this.creator.id,
					},
					data: {
						noOfDraws: {
							increment: 1,
						},
					},
				});

				await prisma.user.update({
					where: {
						id: this.joiner?.id,
					},
					data: {
						noOfDraws: {
							increment: 1,
						},
					},
				});
			} else if (winner === "creator") {
				const gameUpdated = await prisma.game.update({
					where: {
						id: this.gameId,
					},
					data: {
						winnerId: this.creator.id,
						draw: false,
						status: GameStatus.COMPLETED,
					},
				});

				if (!gameUpdated) {
					throw new Error("Game Update Failed.");
				}

				await prisma.user.update({
					where: {
						id: this.creator.id,
					},
					data: {
						noOfWins: {
							increment: 1,
						},
					},
				});

				await prisma.user.update({
					where: {
						id: this.joiner?.id,
					},
					data: {
						noOfLosses: {
							increment: 1,
						},
					},
				});
			} else if (winner === "joiner") {
				const gameUpdated = await prisma.game.update({
					where: {
						id: this.gameId,
					},
					data: {
						winnerId: this.joiner?.id,
						draw: false,
						status: GameStatus.COMPLETED,
					},
				});

				if (!gameUpdated) {
					throw new Error("Game Update Failed.");
				}

				await prisma.user.update({
					where: {
						id: this.joiner?.id,
					},
					data: {
						noOfWins: {
							increment: 1,
						},
					},
				});

				await prisma.user.update({
					where: {
						id: this.creator.id,
					},
					data: {
						noOfLosses: {
							increment: 1,
						},
					},
				});
			}
		} catch (error) {
			console.log(error);
		}
	}

	checkIfBoardComplete(userId: string) {
		const user = this.creator.id === userId ? this.creator : this.joiner;

		if (user?.percentageComplete === 100) {
			return true;
		}

		return false;
	}

	sendReaction(userId: string, reactionId: number) {
		try {
			const opponent =
				userId === this.creator.id ? this.joiner : this.creator;
			opponent?.socket.send(
				JSON.stringify({
					type: OPPONENT_REACTION,
					reaction: this.emojiReactions.filter(
						(reaction: EmojiReactions) => reaction.id === reactionId
					)[0],
				})
			);
		} catch (error) {
			console.log(error);
		}
	}

	fetchGameRoomData(socket: WebSocket) {
		if(this.gameEnded){
			socket.send(
				JSON.stringify(
					{
						type: GAME_ALREADY_ENDED
					}
				)
			)
			return;
		}

		if(this.gameStarted){
			socket.send(
				JSON.stringify(
					{
						type: GAME_ALREADY_STARTED
					}
				)
			)
			return;
		}

		try {
			if (connectionUserIds.get(socket) === this.creator.id) {
				this.creator.socket = socket;
				socket.send(JSON.stringify({ type: DATA_FETCHED, data: {
					roomId: this.gameId,
					type: "creator",
					opponent: {
						id: this.joiner?.id,
						name: this.joiner?.name,
						avatarUrl: this.joiner?.avatarUrl,
						gameInitiated: this.joiner?.gameStarted
					},
					gameInitiated: this.creator.gameStarted
				}}));
				connectionUserIds.delete(socket);
			}
			else if (this.joiner && connectionUserIds.get(socket) === this.joiner?.id){
				this.joiner.socket = socket;
				socket.send(JSON.stringify(
					{
						type: DATA_FETCHED,
						data: {
							roomId: this.gameId,
							type: "joiner",
							opponent: {
								id: this.creator.id,
								name: this.creator.name,
								avatarUrl: this.creator.avatarUrl,
								gameInitiated: this.creator.gameStarted
							},
							gameInitiated: this.joiner?.gameStarted
						}
					}
				))
				connectionUserIds.delete(socket);
			}
		} catch (error) {
			console.log(error);
		}
	}

	fetchGameBoardScreenData(socket: WebSocket) {
		if(this.gameEnded){
			socket.send(
				JSON.stringify(
					{
						type: GAME_ALREADY_ENDED
					}
				)
			)
			return;
		}

		if(!this.gameStarted){
			socket.send(
				JSON.stringify(
					{
						type: GAME_NOT_STARTED
					}
				)
			)
			return;
		}

		try {
			if (connectionUserIds.get(socket) === this.creator.id) {
				this.creator.socket = socket;
				socket.send(JSON.stringify({ type: DATA_FETCHED, data: {
					roomId: this.gameId,
					type: "creator",
					opponent: {
						id: this.joiner?.id,
						name: this.joiner?.name,
						avatarUrl: this.joiner?.avatarUrl,
						mistakes: this.joiner?.mistakes,
						percentageComplete: this.joiner?.percentageComplete,

					},
					initialGameState: this.initialGameState,
					currentGameState: this.creator.currentGameState,
					emojiReactions: this.emojiReactions,
					startTime: this.startTime,
					gameDuration: this.gameDuration,
					mistakes: this.creator.mistakes,
					percentageComplete: this.creator.percentageComplete
				}}));
				connectionUserIds.delete(socket);
			}
			else if (this.joiner && connectionUserIds.get(socket) === this.joiner?.id){
				this.joiner.socket = socket;
				socket.send(JSON.stringify(
					{
						type: DATA_FETCHED,
						data: {
							roomId: this.gameId,
							type: "joiner",
							opponent: {
								id: this.creator.id,
								name: this.creator.name,
								avatarUrl: this.creator.avatarUrl,
								mistakes: this.creator.mistakes,
								percentageComplete: this.creator.percentageComplete
							},
							initialGameState: this.initialGameState,
							currentGameState: this.joiner?.currentGameState,
							emojiReactions: this.emojiReactions,
							startTime: this.startTime,
							gameDuration: this.gameDuration,
							mistakes: this.joiner?.mistakes,
							percentageComplete: this.joiner?.percentageComplete
						}
					}
				))
				connectionUserIds.delete(socket);
			}
		} catch (error) {
			console.log(error);
		}
	}
}
