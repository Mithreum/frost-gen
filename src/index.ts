import { BigNumber } from "ethers";
import * as FROST from "frost-secp256k1";
import { CONFIG } from "./secrets";
import fs from "fs";

function centralGenerateKeys(
	n: number,
	t: number
): FROST.DeriveRes[] {
	const participants = new Array<FROST.ParticipantWrapper>(n);
	const coefficientsHandles = new Array<FROST.ExternalObject<number>>(n);

	for (let i = 0; i < n; i++) {
		const newPart = FROST.participate(i + 1, n, t);
		participants[i] = newPart.participant;
		coefficientsHandles[i] = newPart.coefficientsHandle;
	}

	const participantsShareHandles = new Array<FROST.ExternalObject<number>>(n);
	const participantsMyShares = Array.from(new Array(n), () => new Array<FROST.SecretShareWrapper>());

	participants.forEach((participant, i) => {
		const otherParts = [participants.slice(0, i), participants.slice(i + 1)].flat();
		const theirShares = FROST.generateTheirSharesAndVerifyParticipants(
			participant,
			coefficientsHandles[i],
			otherParts,
			n,
			t
		);
		participantsShareHandles[i] = theirShares.stateHandle;
		for (let j = n - 1; j >= 0; j--) {
			if (j == i) {
				continue
			};
			participantsMyShares[j].push(theirShares.theirSecretShares.pop()!);
		}
	})

	return participantsShareHandles.map((stateHandle, i) => FROST.derivePubkAndGroupKey(
		stateHandle, participants[i], participantsMyShares[i]
	));
}

const HALF_Q = BigNumber.from("0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a1");

export function frostGen() {
	console.log("generating FROST group...");
	let keys: FROST.DeriveRes[];
	let gkey: Buffer;
	let gkx: BigNumber | undefined;
	while (gkx == undefined || gkx.gt(HALF_Q)) {
		keys = centralGenerateKeys(CONFIG.bridge.validatorCnt, CONFIG.bridge.threshold);
		gkey = keys[0].gk;
		gkx = BigNumber.from(`0x${gkey.slice(1).toString("hex")}`);
	}

	const frostPubkeys = [];
	const frostUuids = [];

	const frost_group = {
		gkx: gkx.toHexString(),
		gkyp: gkey![0] & 1
	}

	for (const key of keys!) {
		console.log("\nVALIDATOR", key.pubk.index);
		console.log(`FROST_UUID=${key.pubk.index}
FROST_PUBKEY=${key.pubk.share.toString("hex")}
FROST_PKEY=${key.sk.key.toString("hex")}`);
        //@ts-ignore
		frostPubkeys.push(key.pubk.share.toString("hex"));
        //@ts-ignore
		frostUuids.push(key.pubk.index);
	}

	console.log(`
FROST_GKEY=${gkey!.toString("hex")}
FROST_UUIDS=${frostUuids.join(",")}
FROST_PUBKEYS=${frostPubkeys.join(",")}
FROST_THRESHOLD=${CONFIG.bridge.threshold}`)

	fs.writeFileSync("./frost_group.json", JSON.stringify(frost_group));
	console.log("wrote frost group to ./frost_group.json!")

}

frostGen();
