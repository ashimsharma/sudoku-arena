import { NextFunction, Request, Response } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import prisma from "../db";

const verifyJWT = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const token = req.cookies?.jwt;

		if (!token) {
			res.status(401).json({
				statusCode: 401,
				success: false,
				message: "Token not provided.",
			});
            return;
		}

		let decodedToken: JwtPayload | undefined;

		try {
			decodedToken = jwt.verify(
				token,
				process.env.JWT_SECRET as string
			) as JwtPayload;
		} catch (error) {
			decodedToken = undefined;
		}

		if (!decodedToken) {
			res.status(401).json({
				statusCode: 401,
				success: false,
				message: "Unauthorized request.",
			});
            return;
		}

		let user = await prisma.user.findFirst({
			where: { id: decodedToken.id },
		});

		if (!user) {
			res.status(401).json({
				statusCode: 404,
				success: false,
				message: "User not found.",
			});
            return;
		}

		req.user = user;

		next();
	} catch (error: any) {
		throw new Error(error.message);
	}
};

export default verifyJWT;
