// Reusable legacy-loan importer for the monthly "Summary of Loan
// Released" paper ledgers. Used by the admin Maintenance endpoint so
// the operator can dry-run against PRODUCTION (preview which names
// resolve + the computed net proceeds) before applying.
//
// Net proceeds (cash on hand) = principal − deduction. Deductions are
// stored as a single legacy line (the paper sheet kept no breakdown);
// the existing "Rebuild Charges Breakdown" maintenance action can
// later expand them into the standard ₱620 itemisation.
//
// Idempotent: a loan with the same (borrowerPnNo, principal,
// releasedAt-day) is skipped, so re-running never double-inserts.

import LoanApplication from "../models/LoanApplication.js";
import WaterMember from "../models/WaterMember.js";
import LoanSettings from "../models/LoanSettings.js";
import { computeAmortization } from "./loanAmortization.js";

const TERM_MONTHS = 6;

// ── Monthly batches, transcribed from the paper "Summary of Loan
// Released" sheets. deduction = principal − cash-on-hand (net).
export const LEGACY_LOAN_BATCHES = {
  "2026-01": [
    { last: "Uypala", first: "Analiza", principal: 50000, deduction: 3020, releasedOn: "2026-01-05" },
    { last: "Manabat", first: "Analy", principal: 5000, deduction: 320, releasedOn: "2026-01-12" },
    { last: "Mariano", first: "Babelyn", principal: 4000, deduction: 260, releasedOn: "2026-01-12" },
    { last: "Yray", first: "Dexter", principal: 50000, deduction: 3020, releasedOn: "2026-01-22" },
    { last: "Bocales", first: "Teodoro", principal: 6000, deduction: 380, releasedOn: "2026-01-22" },
    { last: "Peniones", first: "Pelita", principal: 5000, deduction: 320, releasedOn: "2026-01-23" },
    { last: "Legarte", first: "Manuel", principal: 12000, deduction: 740, releasedOn: "2026-01-24" },
    { last: "Espana", first: "Letecia", principal: 7000, deduction: 440, releasedOn: "2026-01-26" },
    { last: "Cose", first: "Marivel", principal: 10000, deduction: 620, releasedOn: "2026-01-27" },
    { last: "Palange", first: "Kennedy", principal: 15000, deduction: 920, releasedOn: "2026-01-28" },
    { last: "Serdoncillo", first: "Marites", principal: 10000, deduction: 620, releasedOn: "2026-01-28" },
    { last: "Gemarino", first: "Vivincia", principal: 7000, deduction: 440, releasedOn: "2026-01-28" },
    { last: "Momo", first: "Jesusa", principal: 5000, deduction: 320, releasedOn: "2026-01-30" },
    { last: "Narvasa", first: "Clarita", principal: 10000, deduction: 620, releasedOn: "2026-01-30" },
    { last: "Quinones", first: "Marlyn", principal: 8000, deduction: 500, releasedOn: "2026-01-30" },
    { last: "Songkip", first: "Maricris", principal: 7000, deduction: 440, releasedOn: "2026-01-30" },
    { last: "Serad", first: "Sandra", principal: 15000, deduction: 920, releasedOn: "2026-01-30" },
    { last: "Ondoy", first: "Aida", principal: 10000, deduction: 620, releasedOn: "2026-01-30" },
    { last: "Versoza", first: "Marilou", principal: 4000, deduction: 260, releasedOn: "2026-01-30" },
    { last: "Aliviado", first: "Lenelyn", principal: 4000, deduction: 260, releasedOn: "2026-01-30" },
    { last: "Aliviado", first: "Marinel", principal: 3000, deduction: 200, releasedOn: "2026-01-30" },
    { last: "Lardes", first: "Danilo", principal: 5000, deduction: 320, releasedOn: "2026-01-30" },
  ],
  "2026-02": [
    { last: "Estrera", first: "Charricel", principal: 4000, deduction: 260, releasedOn: "2026-02-12" },
    { last: "Taotjo", first: "Beverly", principal: 50000, deduction: 3020, releasedOn: "2026-02-12" },
    { last: "Nazareno", first: "Imelda", principal: 5000, deduction: 320, releasedOn: "2026-02-19" },
    { last: "Suribas", first: "Chloe", principal: 15000, deduction: 920, releasedOn: "2026-02-19" },
    { last: "Mapa", first: "Isabelita", principal: 4000, deduction: 260, releasedOn: "2026-02-19" },
    { last: "Cumad", first: "Rosario", principal: 6000, deduction: 380, releasedOn: "2026-02-19" },
    { last: "Generosa", first: "Dolores", principal: 10000, deduction: 620, releasedOn: "2026-02-19" },
    { last: "Manipol", first: "Iluminada", principal: 5000, deduction: 320, releasedOn: "2026-02-19" },
    { last: "Trazo", first: "Sylvia", principal: 10000, deduction: 620, releasedOn: "2026-02-19" },
    { last: "Lanza", first: "Katrina", principal: 3000, deduction: 200, releasedOn: "2026-02-19" },
    { last: "Lanza", first: "Carine", principal: 3000, deduction: 200, releasedOn: "2026-02-19" },
    { last: "Lucob", first: "Teresita", principal: 6000, deduction: 380, releasedOn: "2026-02-19" },
    { last: "Solon", first: "Jessica", principal: 7000, deduction: 440, releasedOn: "2026-02-19" },
  ],
  "2026-03": [
    { last: "Englis", first: "Rosand", principal: 50000, deduction: 3020, releasedOn: "2026-03-18" },
    { last: "Oja", first: "Cristina", principal: 5000, deduction: 320, releasedOn: "2026-03-18" },
    { last: "Ricaplaza", first: "Flora", principal: 5000, deduction: 320, releasedOn: "2026-03-18" },
    { last: "Torres", first: "Flordemae", principal: 5000, deduction: 320, releasedOn: "2026-03-18" },
    { last: "Recla", first: "Mildred", principal: 7000, deduction: 440, releasedOn: "2026-03-18" },
    { last: "Escalon", first: "Leilane", principal: 10000, deduction: 620, releasedOn: "2026-03-18" },
    { last: "Gepitulan", first: "Lynette", principal: 10000, deduction: 620, releasedOn: "2026-03-18" },
    { last: "Banate", first: "Ma. Chuchie", principal: 3000, deduction: 200, releasedOn: "2026-03-18" },
    { last: "Jayme", first: "Romana", principal: 3000, deduction: 200, releasedOn: "2026-03-18" },
    { last: "Rojo", first: "Teofista", principal: 10000, deduction: 620, releasedOn: "2026-03-18" },
    { last: "Mendez", first: "Ma. Era", principal: 6000, deduction: 380, releasedOn: "2026-03-18" },
    { last: "Reyes", first: "Ma. Concepcion", principal: 5000, deduction: 320, releasedOn: "2026-03-18" },
    { last: "Aliviado", first: "Judith", principal: 10000, deduction: 620, releasedOn: "2026-03-18" },
    { last: "Maglasang", first: "Edilbert Jr.", principal: 3000, deduction: 200, releasedOn: "2026-03-18" },
    { last: "Alfornon", first: "Megadalene", principal: 3000, deduction: 200, releasedOn: "2026-03-18" },
    { last: "Lanza", first: "Wilma", principal: 3000, deduction: 200, releasedOn: "2026-03-18" },
    { last: "Miano", first: "Teresita", principal: 6000, deduction: 380, releasedOn: "2026-03-18" },
    { last: "Badili", first: "Simona", principal: 10000, deduction: 620, releasedOn: "2026-03-18" },
    { last: "Adlawan", first: "Arlene", principal: 8000, deduction: 500, releasedOn: "2026-03-18" },
    { last: "Along", first: "Julieta", principal: 4000, deduction: 260, releasedOn: "2026-03-18" },
    { last: "Torion", first: "Diejepete", principal: 5000, deduction: 320, releasedOn: "2026-03-18" },
    { last: "Serad", first: "Porferia", principal: 8000, deduction: 500, releasedOn: "2026-03-18" },
    { last: "Portuso", first: "Dulcesima", principal: 10000, deduction: 620, releasedOn: "2026-03-18" },
    { last: "Moneno", first: "Teofilo", principal: 5000, deduction: 320, releasedOn: "2026-03-18" },
    { last: "Dumdum", first: "Cerelie", principal: 10000, deduction: 620, releasedOn: "2026-03-18" },
    { last: "Perales", first: "Angelita", principal: 3000, deduction: 200, releasedOn: "2026-03-18" },
    { last: "Austre", first: "Rose", principal: 5000, deduction: 320, releasedOn: "2026-03-18" },
    { last: "Tan Ng Gui", first: "Loraine", principal: 4000, deduction: 260, releasedOn: "2026-03-18" },
    { last: "Baliguat", first: "Jessa Mae", principal: 3000, deduction: 200, releasedOn: "2026-03-18" },
    { last: "Escalon", first: "Bermadel", principal: 10000, deduction: 620, releasedOn: "2026-03-18" },
    { last: "Along", first: "Jessa", principal: 5000, deduction: 320, releasedOn: "2026-03-18" },
    { last: "Waskin", first: "Estela", principal: 10000, deduction: 620, releasedOn: "2026-03-18" },
    { last: "Gabor", first: "Angilie", principal: 12000, deduction: 740, releasedOn: "2026-03-18" },
    // March 21, 2026
    { last: "Baliguat", first: "Rosalio", principal: 10000, deduction: 620, releasedOn: "2026-03-21" },
    { last: "Badili", first: "Lelia", principal: 20000, deduction: 1220, releasedOn: "2026-03-21" },
    { last: "Moncano", first: "Junnel", principal: 4000, deduction: 260, releasedOn: "2026-03-21" },
    { last: "Tongal", first: "Lilibeth", principal: 4000, deduction: 260, releasedOn: "2026-03-21" },
    { last: "Alsado", first: "Reynaldo", principal: 12000, deduction: 740, releasedOn: "2026-03-21" },
    { last: "Ditchosa", first: "Charelyn", principal: 5000, deduction: 320, releasedOn: "2026-03-21" },
    { last: "Casas", first: "Mercedita", principal: 5000, deduction: 320, releasedOn: "2026-03-21" },
    { last: "Cortez", first: "Gaudencia", principal: 10000, deduction: 620, releasedOn: "2026-03-21" },
    { last: "Pace", first: "Rosalie", principal: 13000, deduction: 800, releasedOn: "2026-03-21" },
    { last: "Barason", first: "Remedios", principal: 5000, deduction: 320, releasedOn: "2026-03-21" },
    { last: "Zair", first: "Noraisa", principal: 7000, deduction: 440, releasedOn: "2026-03-21" },
    { last: "Canada", first: "Melanie", principal: 4000, deduction: 260, releasedOn: "2026-03-21" },
    { last: "Sarmiento", first: "Lucresia", principal: 5000, deduction: 320, releasedOn: "2026-03-21" },
    { last: "Lanza", first: "Jocelyn", principal: 3000, deduction: 200, releasedOn: "2026-03-21" },
    { last: "Intes", first: "Jenny", principal: 4000, deduction: 260, releasedOn: "2026-03-21" },
    { last: "Pintor", first: "Divina", principal: 7000, deduction: 440, releasedOn: "2026-03-21" },
    { last: "Cece", first: "Margarita", principal: 7000, deduction: 440, releasedOn: "2026-03-21" },
    // March 24, 2026
    { last: "Piquero", first: "Adela", principal: 6000, deduction: 380, releasedOn: "2026-03-24" },
    { last: "Rosario", first: "Marcelo", principal: 3000, deduction: 200, releasedOn: "2026-03-24" },
    { last: "Canales", first: "Nenida", principal: 4000, deduction: 260, releasedOn: "2026-03-24" },
    { last: "Juntong", first: "Rebecca", principal: 9000, deduction: 560, releasedOn: "2026-03-24" },
    { last: "Figuroa", first: "Estela", principal: 10000, deduction: 620, releasedOn: "2026-03-24" },
    { last: "Dumdum", first: "Ebeth", principal: 3000, deduction: 200, releasedOn: "2026-03-24" },
    { last: "Ramirez", first: "Rosario", principal: 7000, deduction: 440, releasedOn: "2026-03-24" },
    { last: "Loremas", first: "Jocelyn", principal: 6000, deduction: 380, releasedOn: "2026-03-24" },
    { last: "Ares", first: "Janice", principal: 5000, deduction: 320, releasedOn: "2026-03-24" },
    { last: "Briones", first: "Maricel", principal: 4000, deduction: 260, releasedOn: "2026-03-24" },
    { last: "Del Rosario", first: "Griselda", principal: 3000, deduction: 200, releasedOn: "2026-03-24" },
    { last: "Alsado", first: "Alona", principal: 5000, deduction: 320, releasedOn: "2026-03-24" },
    { last: "Godinez", first: "Juliet", principal: 4000, deduction: 260, releasedOn: "2026-03-24" },
    { last: "Borraska", first: "Belinda", principal: 3000, deduction: 200, releasedOn: "2026-03-24" },
    { last: "Tapil", first: "Vilma", principal: 7000, deduction: 440, releasedOn: "2026-03-24" },
    { last: "Rota", first: "Mary Jane", principal: 5000, deduction: 320, releasedOn: "2026-03-24" },
    { last: "Mollena", first: "Gerrylin", principal: 3000, deduction: 200, releasedOn: "2026-03-24" },
    { last: "Oquiton", first: "Mary Grace", principal: 4000, deduction: 260, releasedOn: "2026-03-24" },
    { last: "Joseph", first: "Jeffrey", principal: 4000, deduction: 260, releasedOn: "2026-03-24" },
    { last: "Alfante", first: "Iris", principal: 6000, deduction: 380, releasedOn: "2026-03-24" },
    { last: "Andebor", first: "Ryan", principal: 4000, deduction: 260, releasedOn: "2026-03-24" },
    { last: "Songkip", first: "April Christie", principal: 4000, deduction: 260, releasedOn: "2026-03-24" },
    { last: "Badili", first: "Regelita", principal: 7000, deduction: 440, releasedOn: "2026-03-24" },
    { last: "Calo", first: "Lucita", principal: 3000, deduction: 200, releasedOn: "2026-03-24" },
    // March 25, 2026
    { last: "Serad", first: "Luchie", principal: 5000, deduction: 320, releasedOn: "2026-03-25" },
    { last: "Canada", first: "Rosabella", principal: 5000, deduction: 320, releasedOn: "2026-03-25" },
    { last: "Pilapil", first: "Novecilla", principal: 10000, deduction: 620, releasedOn: "2026-03-25" },
    { last: "Tugahan", first: "Shirley", principal: 6000, deduction: 380, releasedOn: "2026-03-25" },
    { last: "Toong", first: "Merceline", principal: 20000, deduction: 1220, releasedOn: "2026-03-25" },
    { last: "Maambong", first: "Filma", principal: 6000, deduction: 380, releasedOn: "2026-03-25" },
    { last: "Torion", first: "Addie", principal: 7000, deduction: 440, releasedOn: "2026-03-25" },
    { last: "Apas", first: "Erlinda", principal: 10000, deduction: 620, releasedOn: "2026-03-25" },
    { last: "Torion", first: "Benita", principal: 7000, deduction: 440, releasedOn: "2026-03-25" },
    { last: "Apas", first: "Maristela", principal: 3000, deduction: 200, releasedOn: "2026-03-25" },
    { last: "Dandan", first: "Antonio", principal: 8000, deduction: 500, releasedOn: "2026-03-25" },
    { last: "Torion", first: "Lorna", principal: 12000, deduction: 740, releasedOn: "2026-03-25" },
    { last: "Cuyos", first: "Jocelyn", principal: 40000, deduction: 2420, releasedOn: "2026-03-25" },
    { last: "Baliguat", first: "Violeta", principal: 3000, deduction: 200, releasedOn: "2026-03-25" },
    { last: "Escalon", first: "Rosalinda", principal: 30000, deduction: 1820, releasedOn: "2026-03-25" },
    // March 31, 2026
    { last: "Narvasa", first: "Ismaelita", principal: 20000, deduction: 1220, releasedOn: "2026-03-31" },
    { last: "Copas", first: "Wedelisa", principal: 15000, deduction: 920, releasedOn: "2026-03-31" },
    { last: "Decena", first: "Charlyn", principal: 6000, deduction: 380, releasedOn: "2026-03-31" },
    { last: "Matugas", first: "Danilo", principal: 3000, deduction: 200, releasedOn: "2026-03-31" },
    { last: "Matugas", first: "Marilou", principal: 7000, deduction: 440, releasedOn: "2026-03-31" },
    { last: "Marquez", first: "Pedina", principal: 12000, deduction: 740, releasedOn: "2026-03-31" },
    { last: "Magnanao", first: "Cynthia", principal: 5000, deduction: 320, releasedOn: "2026-03-31" },
    { last: "Lanza", first: "Josefina", principal: 10000, deduction: 620, releasedOn: "2026-03-31" },
    { last: "Torion", first: "Victoria", principal: 7000, deduction: 440, releasedOn: "2026-03-31" },
    { last: "Legaspino", first: "Meryjess", principal: 5000, deduction: 320, releasedOn: "2026-03-31" },
    { last: "Badili", first: "Gerald", principal: 3000, deduction: 200, releasedOn: "2026-03-31" },
    { last: "Delfin", first: "Florame", principal: 5000, deduction: 320, releasedOn: "2026-03-31" },
  ],
  "2026-04": [
    // April 01, 2026
    { last: "Escalon", first: "Yolanda", principal: 11000, deduction: 680, releasedOn: "2026-04-01" },
    { last: "Canada", first: "Adeodatus", principal: 3000, deduction: 200, releasedOn: "2026-04-01" },
    { last: "Sonedo", first: "Jonnel", principal: 4000, deduction: 260, releasedOn: "2026-04-01" },
    { last: "Sario", first: "Richel", principal: 5000, deduction: 320, releasedOn: "2026-04-01" },
    { last: "Senangote", first: "Belinda", principal: 4000, deduction: 260, releasedOn: "2026-04-01" },
    { last: "Bataluna", first: "Clarita", principal: 5000, deduction: 320, releasedOn: "2026-04-01" },
    { last: "Lanza", first: "Celso", principal: 3000, deduction: 200, releasedOn: "2026-04-01" },
    // April 07, 2026
    { last: "Baguio", first: "Teofila", principal: 6000, deduction: 380, releasedOn: "2026-04-07" },
    { last: "Cose", first: "Marivel", principal: 11000, deduction: 680, releasedOn: "2026-04-07" },
    { last: "Arriba", first: "Decilia", principal: 5000, deduction: 320, releasedOn: "2026-04-07" },
    { last: "Delfin", first: "Dulcesima", principal: 6000, deduction: 380, releasedOn: "2026-04-07" },
    { last: "Narvasa", first: "Rogelio", principal: 10000, deduction: 620, releasedOn: "2026-04-07" },
    { last: "Vicada", first: "Baby Jean", principal: 7000, deduction: 440, releasedOn: "2026-04-07" },
    { last: "Barason", first: "Evelyn", principal: 5000, deduction: 320, releasedOn: "2026-04-07" },
    { last: "Canete", first: "Merlinie", principal: 12000, deduction: 740, releasedOn: "2026-04-07" },
    // April 11, 2026
    { last: "Rojo", first: "Jarche Mae", principal: 3000, deduction: 200, releasedOn: "2026-04-11" },
    { last: "Rojo", first: "Amor Noche", principal: 7000, deduction: 440, releasedOn: "2026-04-11" },
    { last: "Alinabon", first: "Maria Nona", principal: 4000, deduction: 260, releasedOn: "2026-04-11" },
    { last: "Gavine", first: "Elvira", principal: 6000, deduction: 380, releasedOn: "2026-04-11" },
    { last: "Mahinay", first: "Renante", principal: 6000, deduction: 380, releasedOn: "2026-04-11" },
    { last: "Datchusa", first: "Emilie", principal: 5000, deduction: 320, releasedOn: "2026-04-11" },
    { last: "Lambojon", first: "Antonio Jr.", principal: 3000, deduction: 200, releasedOn: "2026-04-11" },
    { last: "Joseph", first: "Jocelyn", principal: 6000, deduction: 380, releasedOn: "2026-04-11" },
    { last: "Padal", first: "Mary Ann", principal: 5000, deduction: 320, releasedOn: "2026-04-11" },
    // April 21, 2026
    { last: "Indiola", first: "Judeline", principal: 7000, deduction: 440, releasedOn: "2026-04-21" },
    { last: "Cunado", first: "Alicia", principal: 3000, deduction: 200, releasedOn: "2026-04-21" },
    { last: "Serad", first: "Irene", principal: 7000, deduction: 440, releasedOn: "2026-04-21" },
    { last: "Salas", first: "Mary Grace", principal: 3000, deduction: 200, releasedOn: "2026-04-21" },
    { last: "Silaya", first: "Iryn", principal: 10000, deduction: 620, releasedOn: "2026-04-21" },
    { last: "Bitoon", first: "Esperanza", principal: 20000, deduction: 1220, releasedOn: "2026-04-21" },
    { last: "Perales", first: "Harold", principal: 3000, deduction: 200, releasedOn: "2026-04-21" },
    { last: "Bancairen", first: "Clavelita", principal: 22000, deduction: 1340, releasedOn: "2026-04-21" },
    { last: "Bancairen", first: "Michelle", principal: 6000, deduction: 380, releasedOn: "2026-04-21" },
    { last: "Pilapil", first: "Mary Ann", principal: 3000, deduction: 200, releasedOn: "2026-04-21" },
    { last: "Bayona", first: "Jeo-Ann", principal: 5000, deduction: 320, releasedOn: "2026-04-21" },
    { last: "Perales", first: "Joselito", principal: 5000, deduction: 320, releasedOn: "2026-04-21" },
    { last: "Calo", first: "Naneth", principal: 3000, deduction: 200, releasedOn: "2026-04-21" },
    { last: "Canada", first: "Adelina", principal: 5000, deduction: 320, releasedOn: "2026-04-21" },
    { last: "Pardillo", first: "Maribel", principal: 3000, deduction: 200, releasedOn: "2026-04-21" },
    { last: "Juablar", first: "Marissa", principal: 6000, deduction: 380, releasedOn: "2026-04-21" },
    { last: "Lagahit", first: "Helen", principal: 5000, deduction: 320, releasedOn: "2026-04-21" },
    // April 22, 2026
    { last: "Alegre", first: "Ma. Chona", principal: 7000, deduction: 440, releasedOn: "2026-04-22" },
    { last: "Torcende", first: "Gina", principal: 7000, deduction: 440, releasedOn: "2026-04-22" },
    { last: "Cristoria", first: "Rosemarie", principal: 4000, deduction: 260, releasedOn: "2026-04-22" },
    { last: "Escalon", first: "Fritzie", principal: 4000, deduction: 260, releasedOn: "2026-04-22" },
    { last: "Sy", first: "Maxima", principal: 10000, deduction: 620, releasedOn: "2026-04-22" },
    { last: "Alicer", first: "Guillerma", principal: 6000, deduction: 380, releasedOn: "2026-04-22" },
    { last: "Sumera", first: "Lolita", principal: 3000, deduction: 200, releasedOn: "2026-04-22" },
    { last: "Austre", first: "Liezel", principal: 5000, deduction: 320, releasedOn: "2026-04-22" },
    { last: "Navales", first: "Elsa", principal: 4000, deduction: 260, releasedOn: "2026-04-22" },
    { last: "Temblor", first: "Analou", principal: 4000, deduction: 260, releasedOn: "2026-04-22" },
    { last: "Balogbog", first: "Elvira", principal: 4000, deduction: 260, releasedOn: "2026-04-22" },
    { last: "Magnanao", first: "Ananias", principal: 5000, deduction: 320, releasedOn: "2026-04-22" },
    // April 23, 2026
    { last: "Sadora", first: "Jocelyn", principal: 5000, deduction: 320, releasedOn: "2026-04-23" },
    { last: "Alcover", first: "Joven", principal: 9000, deduction: 560, releasedOn: "2026-04-23" },
    { last: "Daulong", first: "Jocelyn", principal: 6000, deduction: 380, releasedOn: "2026-04-23" },
    { last: "Torion", first: "Belen", principal: 18000, deduction: 1100, releasedOn: "2026-04-23" },
    { last: "Cumad", first: "Clasil", principal: 6000, deduction: 380, releasedOn: "2026-04-23" },
    { last: "Cugal", first: "Cristita", principal: 3000, deduction: 200, releasedOn: "2026-04-23" },
    // April 25, 2026
    { last: "Nara", first: "Realyn", principal: 7000, deduction: 440, releasedOn: "2026-04-25" },
    // April 29, 2026
    { last: "Canada", first: "Presellin", principal: 6000, deduction: 380, releasedOn: "2026-04-29" },
    { last: "Ruta", first: "Minchie", principal: 6000, deduction: 380, releasedOn: "2026-04-29" },
    { last: "Pitogo", first: "Lorimy", principal: 5000, deduction: 320, releasedOn: "2026-04-29" },
    { last: "Drano", first: "Cirila", principal: 3000, deduction: 200, releasedOn: "2026-04-29" },
  ],
  "2026-05": [
    // May 04, 2026
    { last: "Ople", first: "Lourdes", principal: 5000, deduction: 320, releasedOn: "2026-05-04" },
    { last: "Catian", first: "Salvacion", principal: 3000, deduction: 200, releasedOn: "2026-05-04" },
    { last: "Azarcon", first: "Elizabeth", principal: 5000, deduction: 320, releasedOn: "2026-05-04" },
    { last: "Asupra", first: "Michelle", principal: 5000, deduction: 320, releasedOn: "2026-05-04" },
    { last: "Lanza", first: "Arianne", principal: 5000, deduction: 320, releasedOn: "2026-05-04" },
    { last: "Ocliaso", first: "Jecyl", principal: 50000, deduction: 3020, releasedOn: "2026-05-04" },
    { last: "Torion", first: "Jasmin", principal: 50000, deduction: 3020, releasedOn: "2026-05-04" },
    { last: "Cudis", first: "Cinderila", principal: 50000, deduction: 3020, releasedOn: "2026-05-04" },
    // May 05, 2026
    { last: "Aliviado", first: "Teresita", principal: 4000, deduction: 260, releasedOn: "2026-05-05" },
    { last: "Suliva", first: "Genalin", principal: 3000, deduction: 200, releasedOn: "2026-05-05" },
    { last: "Cepe", first: "Klier", principal: 15000, deduction: 920, releasedOn: "2026-05-05" },
    // May 07, 2026
    { last: "Abarquez", first: "Minerva", principal: 5000, deduction: 320, releasedOn: "2026-05-07" },
    // May 13, 2026
    { last: "Napao", first: "Juslia", principal: 11000, deduction: 680, releasedOn: "2026-05-13" },
    // May 19, 2026
    { last: "Arcilla", first: "Estrella", principal: 6000, deduction: 380, releasedOn: "2026-05-19" },
    { last: "Aliviado", first: "Marilyn", principal: 4000, deduction: 260, releasedOn: "2026-05-19" },
    { last: "Aliviado", first: "Lenelyn", principal: 5000, deduction: 320, releasedOn: "2026-05-19" },
    { last: "Trocio", first: "Carmelita", principal: 4000, deduction: 260, releasedOn: "2026-05-19" },
    { last: "Canada", first: "Anecito Jr", principal: 3000, deduction: 200, releasedOn: "2026-05-19" },
    { last: "Climaco", first: "Eva", principal: 7000, deduction: 440, releasedOn: "2026-05-19" },
    // May 20, 2026
    { last: "Ricaplaza", first: "Marie Grace", principal: 6000, deduction: 380, releasedOn: "2026-05-20" },
    { last: "Ople", first: "Marivic", principal: 10000, deduction: 620, releasedOn: "2026-05-20" },
    // May 25, 2026
    { last: "Blase", first: "Alan", principal: 3000, deduction: 200, releasedOn: "2026-05-25" },
  ],
};

// Known legacy-ledger ↔ canonical-name overrides. Add entries here as
// the operator confirms matches from a dry-run's "failed" list.
const NAME_TO_PN = {
  "Uypala, Analiza": "PZKL4G",
  "Espana, Letecia": "L6SG34",
  "Gemarino, Vivincia": "QPNC2G",
  "Quinones, Marlyn": "6U6VQX",
  "Aliviado, Marinel": "ED3VMY",
  "Bocales, Teodoro": "PT4ZK6",
};

const fold = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

async function resolveMember(last, first) {
  const target = `${last.trim()}, ${first.trim()}`;
  if (NAME_TO_PN[target]) {
    const m = await WaterMember.findOne({ pnNo: NAME_TO_PN[target] }).select("pnNo accountName").lean();
    if (m) return { ok: true, member: m };
  }
  const exactRe = new RegExp(`^${esc(target)}$`, "i");
  let hits = await WaterMember.find({ accountName: exactRe }).select("pnNo accountName").lean();
  if (hits.length === 0) {
    const foldedTarget = fold(target).toLowerCase();
    const cands = await WaterMember.find({
      accountName: new RegExp(`^${esc(fold(last))}`, "i"),
    }).select("pnNo accountName").lean();
    hits = cands.filter((c) => fold(c.accountName).toLowerCase() === foldedTarget);
  }
  if (hits.length === 0) {
    const looseRe = new RegExp(`${esc(last.trim())}.*${esc(first.trim())}`, "i");
    hits = await WaterMember.find({ accountName: looseRe }).select("pnNo accountName").lean();
  }
  if (hits.length === 0) return { ok: false, reason: "no_match", candidates: [] };
  if (hits.length > 1) return { ok: false, reason: "ambiguous", candidates: hits.map((h) => ({ pnNo: h.pnNo, accountName: h.accountName })) };
  return { ok: true, member: hits[0] };
}

const addMonths = (date, n) => { const d = new Date(date); d.setMonth(d.getMonth() + n); return d; };
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// months: array like ["2026-01","2026-02","2026-03"] (or all if empty).
export async function importLegacyLoans({ months = [], dry = true } = {}) {
  const keys = months.length ? months : Object.keys(LEGACY_LOAN_BATCHES);
  const settings = (await LoanSettings.findOne()) || {};
  const rate = Number(settings.interestRatePerMonth ?? 2.5);

  const result = { months: keys, dry, inserted: 0, skipped: 0, willInsert: [], failed: [] };

  for (const key of keys) {
    const rows = LEGACY_LOAN_BATCHES[key] || [];
    for (const row of rows) {
      const name = `${row.last}, ${row.first}`;
      const net = round2(row.principal - row.deduction);
      const res = await resolveMember(row.last, row.first);
      if (!res.ok) {
        result.failed.push({ month: key, name, principal: row.principal, deduction: row.deduction, net, reason: res.reason, candidates: res.candidates });
        continue;
      }
      const member = res.member;
      const releasedAt = new Date(`${row.releasedOn}T00:00:00`);
      const dayStart = new Date(releasedAt);
      const dayEnd = new Date(releasedAt.getTime() + 86400000);
      const existing = await LoanApplication.findOne({
        borrowerPnNo: member.pnNo, principal: row.principal,
        releasedAt: { $gte: dayStart, $lt: dayEnd },
      }).select("_id loanId").lean();
      if (existing) {
        result.skipped++;
        result.willInsert.push({ month: key, name, account: member.pnNo, accountName: member.accountName, principal: row.principal, deduction: row.deduction, net, releasedOn: row.releasedOn, status: "already exists", loanId: existing.loanId });
        continue;
      }

      result.willInsert.push({ month: key, name, account: member.pnNo, accountName: member.accountName, principal: row.principal, deduction: row.deduction, net, releasedOn: row.releasedOn, status: dry ? "would insert" : "inserted" });

      if (dry) continue;

      const amort = computeAmortization({ principal: row.principal, monthlyRatePct: rate, termMonths: TERM_MONTHS });
      const firstPaymentDate = addMonths(releasedAt, 1);
      const schedule = (amort.rows || []).map((r, i) => ({ ...r, dueDate: addMonths(firstPaymentDate, i) }));
      const maturityDate = schedule[schedule.length - 1]?.dueDate || addMonths(firstPaymentDate, TERM_MONTHS - 1);
      await LoanApplication.create({
        borrowerPnNo: member.pnNo,
        borrowerName: name,
        borrowerStatus: "active",
        loanType: "regular",
        purpose: `Imported from legacy ledger (${key})`,
        modeOfPayment: "monthly",
        principal: row.principal,
        interestRatePerMonth: rate,
        termMonths: TERM_MONTHS,
        monthlyPayment: amort.monthlyPayment,
        totalPayment: amort.totalPayment,
        totalInterest: amort.totalInterest,
        amortizationSchedule: schedule,
        charges: [{ key: "legacy_deduction", label: "Deductions (legacy)", type: "flat", value: row.deduction, amount: row.deduction }],
        totalCharges: row.deduction,
        netProceeds: net,
        status: "released",
        appliedAt: releasedAt,
        managerApprovedAt: releasedAt,
        approvedAt: releasedAt,
        releasedAt,
        disbursedAt: releasedAt,
        firstPaymentDate,
        maturityDate,
        totalPaid: 0,
        balance: amort.totalPayment,
        remarks: `Imported from legacy paper ledger (${key}).`,
        createdBy: "import-script",
        managerApprovedBy: "import-script",
        approvedBy: "import-script",
        releasedBy: "import-script",
        disbursedBy: "import-script",
        disbursementMethod: "cash",
      });
      result.inserted++;
    }
  }
  return result;
}
