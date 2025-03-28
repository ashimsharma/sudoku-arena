import { Router } from "express";
import { githubLogin, githubLoginCallback, googleLogin, googleLoginCallback, isAuthenticated, loginFailed } from "../controllers/auth";
import passport, { authenticate } from "passport";
import verifyJWT from "../middlewares.ts/auth.middleware";

const authRouter = Router();

authRouter.route("/github").get(githubLogin);
authRouter.route("/github/callback").get(passport.authenticate("github", { session: false, failureRedirect: process.env.FAILURE_REDIRECT }), githubLoginCallback);

authRouter.route("/google").get(googleLogin);
authRouter.route("/google/callback").get(passport.authenticate("google", { session: false, failureRedirect: process.env.FAILURE_REDIRECT }), googleLoginCallback);

authRouter.route("/check-auth").get(verifyJWT, isAuthenticated);

export default authRouter;