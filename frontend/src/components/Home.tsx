import { useNavigate } from "react-router-dom"

export default function Home(){
    const navigate = useNavigate();

    const startGame = () => {
        navigate("/game");
    }

    return (
        <div className="min-h-screen mx-5 text-white my-4">
            <div className="grid grid-cols-3 gap-10 min-h-full">
                <div className="border rounded-md min-h-full flex justify-center items-center">Your Previous Games</div>
                <div className="flex flex-col items-center justify-center">
                    <button className="bg-red-500 hover:bg-red-600 flex justify-center items-center rounded px-4 p-2 w-full" onClick={startGame}>New Game</button>
                    <div>Animation</div>
                </div>
                <div className="border rounded-md min-h-full flex justify-center items-center">News to Share</div>
            </div>
        </div>
    )
}