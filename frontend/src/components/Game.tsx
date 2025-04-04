import { useEffect, useState } from "react";
import { HiArrowLeft } from "react-icons/hi"; 
import { useLocation, useNavigate } from "react-router-dom";
import CreateRoomModal from "./CreateRoomModal";
import { getSocket } from "../config/socket.config";
import { useSelector } from "react-redux";

interface User {
    id: string
    name: string
    avatarUrl: string
    email: string
}

const Game = () => {
	const [modalOpened, setModalOpened] = useState(false);
	const [socket, setSocket] = useState<WebSocket | null>(null);
	const me: User = useSelector((state: any) => state.user).user;
	const location = useLocation();

	useEffect(() => {
		console.log(location.state)
		if(location.state?.from !== "/"){
			navigate("/");
		}

		return;

		try {
			setSocket(getSocket());
		} catch (error) {
			console.log(error);
		}
	}, [])

	const navigate = useNavigate();

	const back = () => {
		navigate("/");
	};

	const openModal = () => {
		setModalOpened(true);
	};

	const onClose = () => {
		setModalOpened(false);
	};

	const onCreate = ({
		difficulty,
		gameType,
	}: {
		difficulty: string;
		gameType: string;
	}) => {
		setModalOpened(false);

		console.log(difficulty);
		console.log(gameType);
	};

	return (
		!socket ? <p>Loading...</p> : 
		
		<div className="flex flex-col items-center min-h-screen bg-gray-900 p-4 relative gap-4">
			<button
				className="absolute top-6 left-6 flex items-center text-white hover:text-gray-400 transition-all duration-300"
				onClick={back}
			>
				<HiArrowLeft className="text-2xl mr-2" />
				<span className="text-lg font-medium">Back</span>
			</button>

			<div className="flex w-1/4 bg-gray-800 p-4 text-white rounded-lg justify-center items-center gap-4">
					<img src={me.avatarUrl} alt="User Avatar" className="h-28 w-28 rounded-full" />
					<p className="text-center text-2xl">{me.name}</p>
			</div>

			<div className="bg-gray-800 bg-opacity-50 backdrop-blur-md p-6 rounded-2xl shadow-lg text-white w-full max-w-sm">
				<h2 className="text-3xl font-bold text-red-500 text-center">
					SUDOKU ARENA
				</h2>
				<p className="text-gray-300 text-center mt-2">
					Create your own room!
				</p>

				<div className="mt-6 flex flex-col gap-4">
					<button
						className="bg-red-500 hover:bg-red-600 transition-all duration-300 text-white font-semibold py-2 px-4 rounded-lg"
						onClick={openModal}
					>
						Create Room
					</button>
					<button className="bg-gray-700 hover:bg-gray-600 transition-all duration-300 text-white font-semibold py-2 px-4 rounded-lg">
						Join Room
					</button>
				</div>
			</div>
			{modalOpened && (
				<CreateRoomModal onClose={onClose} onCreate={onCreate} />
			)}
		</div>
	);
};

export default Game;
