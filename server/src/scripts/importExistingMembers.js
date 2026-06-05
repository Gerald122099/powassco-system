// One-shot importer for the legacy paper-ledger membership rolls.
//
// Run with:  npm run import-existing   (cwd = server/)
//
// What it does
// ------------
// Reads the embedded sitio lists below (Looc Sur, Owak Proper), parses each
// line into a member + 1-or-N meters, applies these conventions from the
// original Excel:
//   - "Lastname, Firstname # N"        → meter sequence N on this account
//   - "# N (sub)"                      → meter N belongs to sub-tenant "sub"
//   - "(comm.)" / "(commercial)"       → classification: commercial
//   - "-sc" / "(sc)" / " sc"           → senior citizen (isDiscountMeter on
//                                        that meter, hasSeniorDiscount on
//                                        the account)
//   - "-new" / " new"                  → ignored (just a marker)
//   - "(from <other PN>)"              → stored verbatim in notes, NOT as sub-name
// Multi-meter accounts (the same head-of-household showing up with #1, #2,
// #3) are folded into ONE member document with N entries in meters[].
//
// Output format
//   pnNo            6 alphanumeric (e.g. "K8M3PQ")  — also used as
//                   "Account Number" in the UI for existing members.
//   meterNumber     5-digit base + "#N" suffix       — e.g. "23842#1"
//   isExistingMember = true                          — flag the migration
//
// Idempotency
//   Re-running is safe: any (sitio + canonicalName) we've already imported
//   is skipped. We do NOT update existing records — the officer is expected
//   to edit them through the UI to fill in missing fields.

import mongoose from "mongoose";
import dotenv from "dotenv";
import WaterMember from "../models/WaterMember.js";

dotenv.config();

// ─── Source data ─────────────────────────────────────────────────────

const SITIOS = [
  {
    name: "Looc Sur",
    barangay: "OWAK",
    municipalityCity: "ASTURIAS",
    province: "CEBU",
    lines: `
Abenir, Leonora
Abellana, Juluis
Academia, Allan
Aguanta, Alejandro Jr.
Aguanta, Aniceta # 1
Aguanta, Aniceta # 3
Aguanta, Aniceta # 4
Aguanta, Christopher #1 (susan)
Aguanta, Christopher #2(VRAL)
Aguanta, Christopher #3 (balay)
Aguanta, Christopher #4(fabian)
Aguanta, Cresher
Aguanta, Excelsior
Aguanta, Flora Mae
Aguanta, Hanzel
Aguanta, Jose Christian
Aguanta, Leslyn
Aguanta, Marcelo Fernando (comm.)
Aguanta, Maria Antonieta-new
Aguanta, Marvie #1
Aguanta, Marvie #2
Aguanta, Norma # 1
Aguanta, Norma # 2
Aguanta, Rhoda
Aguanta, Vina #1
Aguanta, Vina #2
Alcover, Joven
Alicer, Guillerma
Aligarbes, Nicco
Aliviado, Adelfa # 1
Aliviado, Gina
Aliviado, Joel #1
Aliviado, Joel #2
Aliviado, Judith-sc
Aliviado, Karylle
Aliviado, Lenelyn
Aliviado, Leyneth
Aliviado, Leonilo
Aliviado, Marilyn
Aliviado, Mareniel
Aliviado, Teresita
Aliviado, Wendelyn
Alivio, Roselyn
Alsola, Bilmor
Alsola, Juliet
Anciete, Arnold
Anciete, Cecilia
Andebor, Ryan
Anugot, Diosa
Añiga, Lucilyn #1
Aquatic Phoenix # 1 (comm.)-new
Aquatic Phoenix # 6 (comm.)
Arcilla, Estrella
Arriba, Imma Concepcion
Asturias Farms # 1- (comm.) new
Asturias Farms # 7 (comm.)
Atamosa, Annie Beth
Atamosa, Jay Marvin
Atamosa, Mary Ann #1
Atamosa, Mary Ann #2
Atamosa, Mary Ann#3
Austre, Emilie-new
Austre, Liezel
Austre, Rose
Aventuna, Henchu
Aventuna, Jean
Badili, Janecita
Badili, Lelia # 1
Barason, Evelyn
Barason, Lorna
Barason, Remedios-sc
Bardenas, Ceilito # 6
Bardenas, Flordeliz
Bardenas, Mars
Baron, Jo Ann # 1
Baron, Linda
Batoctoy, Alexander #1
Batulan, Armando
Batulan, Frexie Mae
Baumann, Emma
Bayoneta, Jose # 1
Bayoneta, Jose # 2
Bertumen, Noel #1-(comm.)
Bertumen, Noel #2
Bertumen, Noel #3
Borraska, Belinda
Brevick, Vivian #1
Brizo, Lenie
Cabardo, Crosbelito
Cabalonga, Violeta
Cabigon, Othello
Cajis, Marilyn
Calinog, Aireen
Cañada, Mayche #2
Capuras, Andres Jr.-sc
Capuras, Crystal Jade
Carmelotes, Enrique Jr.
Casanes, Kid Carl # 1
Casanes, Kid Carl # 2-new
Casas, Mercideta
CEBECO III(comm.)
Cece, Margarita
Celaje, Maribel # 2
Celin, Stella Marie
Celis, Juanita - sc
Cepe, Kleir
Cervantes, Vicky Carmelita-sc
Cobo, Jaime Jr. #1
Cobo, Jaime Jr. #2
Codoy, Victor
Comighod, Jessica
Cose, Marivel
Cristoria, Honey Marie
Cristoria, Jenalyn
Cristoria, Rogelio Jr.
Cristoria, Rosa # 1
Cristoria, Rosa # 3
Cristoria, Rosalie
Cristoria, Rose Marie
Cubico, Justine
Cuesta, Charina
Cuesta, Flora # 2
Cuesta, Francisco
Cuesta, Leonardo
Cuesta, Saturnina
Cuesta, Wilfredo Jr.
Cudby, Ma. Melinda
Daliva, Maria Lyn
Dandan, Antonio
Datchusa, Emily
Dayola, Rodel Lauren
Decena, Jenny
Delfin, Alejandro
Delfin, Alexis
Delfin, Bernadette
Delfin, Claudio
Delfin, Dulcesima # 1
Delfin, Dulcesima # 2
Delfin, Dulcesima # 3
Delfin, Florame
Delfin, Glenda
Delfin, Ma. Divina
Delfin, Ma. Shela #1
Delfin, Ma. Shela #2
Delfin, Oscar
Delfin, Rita #1
Delfin, Rita #2
Delfin, Rosalie
Delfin, Rowena #1
Delfin, Rowena #2
Desamparado, Ma. Cristina-new
Dico, Jeanilyn #2
Dico, Jeanilyn #1
Digamo, Aldo Rey #1
Digamo, Aldo Rey #2
Ditchosa, Charelyn
Ditchosa, Joesilita
Duran, Alexis Mye
Eben, Minerva # 1
Eben, Minerva # 2
Eben, Minerva # 3
Eben, Minerva # 4 -sc
Eben, Minerva # 5
Elarcosa, Daisy
Elarcosa, Jose
Encarguez, Marilou
Estrada, Victor
Fernandez, Jocelyn
Fernandez, Shaula
Figuroa, Estela-sc
Flaviano, Rosalyn Antonett
Gabor, Joefrey #1
Galapin, Myrna
Galo, Arnold
Gallardo, Fe  - (comm.)
Gavine, Karen
Gavine, Elvira-new
Generosa, Dolores #1
Generosa, Dolores #2
INC
Intes, Jenny
Jayme, Felizardo
Jayme, Jovelito
Jayme, Leonor
Jayme, Marlene #1
Jayme, Marlene # 2
Jayme Moncado Academy
Jimenez, Babie Mary Beth # 2 (from Saturnina Cuesta # 2)
Juablar, Marissa
Jubay, Ginia
Julom, Emilie
Julom, Juvie
Julom, Melanie # 1
Julom, Melanie # 2
Julom, Rosa-new- sc
Juntong, Teofila
Kiamco, Tedeneko
Lagad, Anunciacion
Lanza, Arianne
Lanza, Leonora
Lapiña, Rosemarie
Lardes, Danilo
Lardes, Ma. Clarita
Lardes, Violita
Lee, Vichie Lou
Legarte, Manuel #1
Legarte, Manuel #2
Legaspi, Cheyenne
Legaspi, Vicenta
Leyson, Filomina
Liarta, Rocel
Libatan, Regil
Loregas, Charie
Lucero, Oliver
Lumangtad, Gemma
Macul, Mary Jane #2
Macul, Mary Jane #1
Magbanua, Orlando
Magnanao, Ananias
Magnanao, Cynthia
Magnanao, Joel
Mahipos, Marilyn
Malabon, Christine # 1
Malabon, Roque
Malabon, Romulo Jr.
Manlapaz, Maria Catherine
Marayan, Jocelyn
Marquez, Pedina #1
Matugas, Danilo-sc
Matugas, Jade
Matugas, Jeane Rose
Matugas, Marilou
Mission, Anna Marie
Mollena, Gerrylin
Mollena, Junie # 2
Mollena, Junie # 3
Mollena, Rodulfo
Montebon, Joseph #1
Montebon, Joseph #2
Montecillo, Alicia
Montero, Edna
Montero, Merry Ann
Muñasque, Bienvenido
Nardo, Lolita-new
Nardo, Ma. Emma
Narvasa, Carlita (sc) #1
Narvasa, Fermin #1-new
Narvasa, Fermin #2
Narvasa, Fermin #3
Narvasa, Fermin #4
Narvasa, Joselita-sc
Narvasa, Ma. Chona
Navales, Elizabeth
Navales, Elsa
Nazareno, Imelda #1
Nazareno, Imelda #2
Nickum, Antonia
Oja, Cristina
Oja, Ma. Fe # 1
Oquiton, Maricries
Oquiton, Mary Grace
Oquiton, Vincent
Pacris, Marissa
Pancho, Aurora
Pantaleon, Hazel
Pantilgan, Vilma
Parangan, Avelino
Parangan, Maribeth
Parone, Norma
Pateño, Vivian
Pelayo, Genelyn
Pepito, De-Ann
Perales, Harold
Pintoy, Norma #1 (sc)
Pintoy, Norma #2
Pintoy, Norma #3
Pitogo, Florita
Pitogo, Nenita
Pitogo, Susana
Poliran, Rosellin
Ponteras, Lilia
Quiachon, Elizabeth
Quiachon, Tesalonica
Quismundo, Josefina
Quismundo, Owen
Ramos, Delfin-new
Reboldad, Ana Grace
Redula, Jessa
Redula, Madelin
Ricaña, Jonnielou
Rivera, Liezl
Rota, Mary Jane
Rubio, Carleen
Rubio, Marta # 2-new
Rubio, Marta # 3
Ruta, Luchie
Ruta, Minchie #1
Ruta, Minchie #2
Ruta, Ruben
Sadaya, Teofilo II
Salas, Mary Grace
Sarmiento, Lucresia - sc
Segundino, Emelyn
Señoron, Yuri(commercial)
SILOFA
Songkip, Jorge
Suribas, Chloe-new
Suribas, Ralitza
Tambolero, Robert
Tambolero, Teresa Josefina #1-sc(rice field)
Tambolero, Teresa Josefina #2(shery)
Tañeca, Ma. Magdalina
Tanggol, Editha -sc
Tirador, Sheila
Tompar, Antonio
Toong III, Dominador #1
Torcende, Gina # 1
Torcende, Gina # 2
Torion, Addie
Torion, Benita
Torion, Emma
Torion, Estelita
Torion, Esterlita
Torion, Hermelina # 2
Torion, Josefina # 1
Torion, Josephine
Torion, Leonilo
Torion, Lorna #1
Torion, Lorna #2
Torion, Mansueto # 1
Torion, Mansueto # 2
Torion, Marlyn
Torion, Reynaldo # 1
Torion, Reynaldo # 2
Torion, Ruel
Torion, Sheramae
Torion, Sol Maria
Torion, Victoria - sc
Torion, Vincent
Torion, Vivien Joy
Trazo, Asuncion # 1
Trazo, Asuncion # 2
Trazo, Sylvia-new
Trinidad, Maricel
Trocio, Carmelita
Trocio, Elsie
Trocio, Lucela
Trocio, Roberta - sc
Tugahan, Sherlita
Tugbong, Thilia - sc
Tundag, Myrna
Tundag, Rusell
Turno, Mary Grace
Valenzuela, Junthy #2
Villafuerte, Josephine
`.trim(),
  },
  {
    name: "Owak Proper",
    barangay: "OWAK",
    municipalityCity: "ASTURIAS",
    province: "CEBU",
    lines: `
Abano, Alyana
Abano, Concordia-sc
Abarquez, Minerva
Abarquez, Miraflor # 1
Abarquez, Miraflor # 2
Abarquez, Miraflor # 3
Abarquez, Miraflor # 4
Abarquez, Miraflor # 5
Achapero, Virgilia
Adlao, Cherry
Adlawan, Arlene #1
Adlawan, Arlene #2
Adlawan, Faustino
Adolfo, Norberta
Agbay, Jocel
Alcos, Diosdada
Alegre, Ma. Chona
Alfante, Iris
Aliñabon, Ma. Nona-sc
Alipin, Luis Larry # 1-new
Alipin, Luis Larry # 2
Along, Celerina
Along, Jessa
Along, Julieta
Alsado, Alona
Alsado, Maridan
Alsado, Reynaldo
Amaleona, Angelita
Amaya, Jonie
Antabo, Jennibeth
Añana, Honeybe
Apas, Erlinda
Apas, Maristela #2
Aquines, Helen
Ares, Janice #1
Arriba, Decilia
Asupra, Mischelle #2
Asupra, Mischelle #1
Atamosa, Antonio #1
Atamosa, Antonio #2
Atamosa, Carmelita # 1-new
Atamosa, Carmelita # 2
Aves, Angelita
Awit, Geralyn
Bacus, Elvis
Bacus, Eusebia
Badili, Alexander
Badili, Liberato # 1
Badili, Regelita-new
Badili, Rowegina
Baga, Jessa
Bagsican, Blecy Decjane
Baguio, Teofila
Baliguat, Aldrin # 1
Baliguat, Alexander #1
Baliguat, Aprilita #1
Baliguat, Aprilita #2
Baliguat, Charisma # 1-new
Baliguat, Geracleo
Baliguat, Jessa Mae
Baliguat, Ma. Teresa
Baliguat, Rosalio Jr.
Baliguat, Sherwin
Baliguat, Violita
Balili, Lourdes # 1
Balogbog, Charlette
Balogbog, Elvira
Balolot, Virgilio
Banate, Lolita
Banate, Ma. Chuchi-new
Bancairen, Clavelita # 1-sc-new
Bancairen, Clavelita # 3
Bancairen, Michelle
Bardenas, Ceilito #1 (comm.)-new
Bardenas, Ceilito # 3- (comm.)new
Bardenas, Ceilito # 4
Bardenas, Ceilito # 5-new
Bardenas, Ceilito # 7
Batoctoy, Prescilla #1
Batoctoy, Prescilla #2
Batoctoy, Prescilla #3
Batulan, Jocelyn
Belacse, Kristine
Bell, Maria Norma
Benitez, Nelida
Bentas, Catherine
Bermejo, Juvelyn
Bitoon, Gracelda
Bitoon, Higinita # 1 (store)
Bitoon, Higinita # 2
Bitoon, Higinita # 3
Bitoon, Higinita # 4
Bitoon, Janice #2
Bitoon, Tiffany
Blase, Alan
Blase, Inocenta
Blase, Jessie
Bocales, Charmine
Bocales, Teodoro #2
Branzuela, Jodilyn
Briguli, Ruena
Bucag, Jerry
Buen, Emma #1
Buen, Emma #2
Bugto, Gina
Buhawe, Anabel
Caballero, Jonicey # 1
Caballero, Teodora
Caballero, Oliver #1-new
Cabatingan, Grace
Cabo, Josefina
Caducoy, Christian Ray Sr.
Calderon, Mechelle Dianne
Calo, Lucita
Calo, Mae
Calo, Marilou
Caminos, Charles Dominique
Campo, Steven
Camporedondo, Irene
Cañada, Alvin #2
Cañada, Anecito Jr. #1
Cañada, Anecito Jr. #2
Cañada, Catherine
Cañada, Celso-new
Cañada, Edesa
Cañada, Elsie
Cañada, Eman
Cañada, Erlinda
Cañada, Glicel
Cañada, Hannelyn
Cañada, Josephine
Cañada, May # 1
Cañada, Mayche
Cañada, Melane
Cañada, Roger
Cañada, Rosabella
Canales, Merlita
Canales, Nenida
Cañedo, Ma. Jocelyn
Cañedo, Wagner
Canillo, Michael
Cano, Ganara
Canono, Amelita
Canono, Mikko Adelbert (comm.)
Carido, Myrna
Caro, William James
Carredo, Teresita
Casagan, Oliver
Casas, Adoracion # 1
Casas, Adoracion # 3
Cati-an, Salvacion
Celin, Adrian #1
Celin, Anabella # 1
Celin, Anabella # 2
Celin, Angelo
Celo, Wilhill
Chiu, Teresita
Climaco, Eva #1
Cojo, Jacklyn
Compuesto, Ladislao Jr.
Concepcion, Gegen
Concepcion, Genelyn Marie
Concepcion, Greg
Condor, Benjamen-new
Conejo, Maria Verma
Conserva, Merlita #1
Conserva, Merlita # 2
Copas, Anacorita-new
Copas, Noland # 1
Copas, Wedelisa # 1
Cortez, Gaudencia #2
Cortez, Genagen
Cortez, Rochella
Cudis, Cindirela #1
Cugal, Cristita
Cumad, Rosario -sc
Cuyos, Jocelyn #3
Cuyos, Jocelyn # 4
Day Care Center - Subdivision
Day Care Center - PD Road
Decena, Charlyn
Deiparene, Analou
Demotor, Renalen
Densing, Floresa # 1
Densing, Floresa# 2
Despi, Clynne Jay
Devivar, Lourdes
Diapana, Edelwesa
Diapana, Francisco
Diapana, Heledina
Diaz, Juna Hara
Dinauto, Gamaliel Jonas #1
Dinauto, Gamaliel Jonas #2
Dinauto, Gamaliel Jonas #3
Dolloso, Teresita
DSN
Dumdum, Analuna
Dumdum, Claire
Dumdum, Divina
Dumdum, Maria Lourdes
Dumdum, Ebeth
DuMond, Dalia
Dupal-ag, John Carl #3 (comm.)
Dupal-ag, Justiniano - sc
Dusil, Marilou
Ebrado, Nonieta
Ecalnir, Rhoda
Ecarma, Josephine
Echavez, Florgilyn
Edisan, Alberto
Emnacen, Aiko John
Engasca, Elsie
Engasca, Ophelia
Engasca, Janice
Engaska, Loila
Engasca, Tupinee
Engaska, Wilner
Englis, Alicia #2
Englis, Rosand #2-new
Englis, Rosand # 3
Escalon, Bermadel # 1 (sc)
Escalon, Bermadel # 2
Escalon, Bermadel # 3
Escalon, Fretzie
Escalon, Leilane-new
Escalon, Rosalinda #1
Escalon, Rosalinda #2 - sc
Escalon, Rosalinda #3
Escalon, Roy
Escalon, Yolanda # 1
Escoto, Marieta-sc
Estilliso, Dominador Jr.
Estrera, Charricel
Faustino, Gilbert
Fernandez, Villalee
Ferolino, Ma. Teresa
Flores, Apolonio
Flores, Ma. Cecilia
Flores, Hilda
Frejoles, Arlene
Gabo, Divina
Gabor, Angelie # 1
Gabor, Joeffrey # 2
Galo, Marideth # 2 (store)
Gamus, Doreen
Garces, Ma. Luisa
Garcia, Melquiades Jr.
Gengoyon, Francisca #1
Gengoyon, Francisca #2
Gepitulan, Lynette
Gepitulan, Zosima
Godinez, Juliet
Grejaldo, Joenar #1
Grejaldo, Joenar #2
Guinita, Rodelio
Gutierez, Imee
Gutierez, Maricar
Hermoso, Rosemarie
Honoridez, Marcela - sc
Hortilano, Cristine May
Hortilano, Diogenes
Ichikawa, Analyn # 2
Impas, Salome
Indiola, Judeline #1
Indiola, Judeline #2
Indolos, Crisna-new
Jayme, Jayvee
Jayme, Jesil
Jimenez, Lorito
Joseph, Amelia #1
Joseph, Henry-new
Joseph, James
Joseph, Jocelyn #1
Joseph, Jocelyn #2
Joseph, Menelia
Joseph, Nestor
Joseph, Rory
Joseph, Tita
Keliope, Cherry Mae
Kiliope, Karen
La-ag, Catherine
Lacno, Napoleon
Lanza, Emeliana
Lanza, Janice
Lanza, Myrna
Lanza, Salvina
Lapiña, John Kelvin #1
Lapiña, John Kelvin #2
Laron, Carmelita
Legaspino, Mery Jess
Leones, Jegger
Leyson, Mae Cheryl
Libongcogon, Hepolita # 1
Libongcogon, Hepolita # 3
Libongcogon, Hepolita #6
Lim, Lovely Joyce
Limpag, Johnrey #1
Limpag, Johnrey #2
Loremas, Carine May
Lorigas, Eugene
Lucob, Divina
Lucob, Richie
Lumapas, Charry
Lumapas, Ma. Babylin
Maano, Edison
Maano, Eduardo - sc
Mabanta, Flornando
Macapaz, Evelyn
Macutay, Eranie
Maglasang Jr., Edilberto-sc
Maglasang, Ever
Maglasang, Rosendo
Mahidlawon, Hamelcar
Mahilum, Catherine
Mahilum, Dolores
Mahinay, Hesosa
Manipol, Iluminada-sc
Mante, Geraldine
Mangitngit, Carmelle
Mapa, Cristy Joy
Mapa, Isabelita
Marayan, Annabelle
Mariot, Maribeth
Marquez, Pedina #3
Mayol, Artemio
Medalla, Charity #1
Medalla, Charity #2
Mejares, Rosita
Mendez, Ma. Era
Meñosa, Marilou
Mesa, Genevive
Miano, Teresita
Milano, Sarah
Minoza, Giovanni
Molo, Pacita
Moncano, Joseph
Moncano, Junel
Moncano, Lorlyn
Montebon, Vincent
Montero, Florecel
Montes, Virginia
Mordeno, Christopher
Nacorda, Merlinda -new
Narsico, Legieh Marie
Narvasa, Angelita # 1
Narvasa, Angelita # 2
Narvasa, Angelita # 3
Narvasa, Anward
Narvasa, Clarita- sc new
Narvasa, Constancia # 1
Narvasa, Constancia # 2-new
Narvasa, Constancia # 3
Narvasa, Constancia # 4
Narvasa, Imelda-new
Narvasa, Ismaelita
Narvasa, Janith
Narvasa, Juanilla
Narvasa, Leah # 1
Narvasa, Leah #2
Narvasa, Maria Haide
Narvasa, Ma. Nanette
Narvasa, Nicanor-sc
Narvasa, Ritchel
Narvasa, Rogelio
Navarro, Ma. Even
NIA
Nieves, Vivian #2
Nocos, Amelita
Nocos, Dennis
Nocos, Edwin
Nocos, Ma. Teresa
Nocos, Ma. Teresa #2
Nocos, Vicente
Nocus, Monalisa
Nocus, Susan
Oliverio, Mary Ann
Ondoy, Aida
Ondoy, Divina # 1
Ondoy, Divina # 2
Ondoy, Divina # 3
Ondoy, Divina # 4
Ondoy, Divina # 5
Ondoy, Divina # 6
Ondoy, Divina # 7
Ondoy, Divina # 8
Ondoy, Divina # 9
Ondoy, Divina # 10
Oquiton, Nida
Owak Barangay Hall
Owak Elem. School # 1-new
Owak Elem. School # 2
PABLOTUDA comm
Paden, Nenitha
Padin, Annabel
Padin, Emmanuel # 1 (from Galo, Marideth # 3)
Padin, Eror
Padin, Josephine # 1
Padin, Josephine # 2
Padin, Josephine # 3
Padin, Nerissa
Pahal, Eduardo
Palang, Delialah
Palange, Kennedy # 1
Palange, Kennedy # 2
Palange, Kennedy # 3
Pardillo, Marivel
Partulan, Melfa
Pasaylo, Florecita # 1-new
Pasaylo, Florecita # 3
Pasaylo, Jerby
Pasaylo, Joann
Peniones, Cristine
Peniones, Pelita
Pepito, Brigette
Pepito, Diana Mae
Pepito, Veverly-Ann
Perales, Angelita - sc
Perales, Jave Anthony
Perales, Joselito
Pilapil, Danilo
Pilapil, Juanito
Pilapil, Novecilla -  # 1  sc
Pintor, Divina - new
Piquero, Adela - sc
Policios, Lilian
Pontillas, Felisa # 1
Pontillas, Felisa # 2
Portuso, Dulcesima #1
Portuso, Dulcesima #2
Portuso, Gloria
POWASSCO Office
Quilag, Mariejen
Quindao, Maria Agnes-new #1
Quindao, Maria Agnes #2
Quindao, Melissa
Quindao, Patricio -sc
Quindao, Restituto Jr. #1
Quindao, Restituto Jr. #2
Rallos, Merlyn
Ramirez, Josephine
Ramirez, Rosario
Ramsey, Vilma #1-new
Ramsey, Vilma #2
Ramsey, Vilma #3
Recla, Mildred
Reponte, Peter
Repuesto, Adones
Repuesto, Cresencio
Retubado, Guadalupe
Revilla, Jose
Ricaplaza, Flora # 1
Richter, Darling #1
Richter, Darling #2
Rivera, Vilma
Roca, Ma. Ebonita
Rojo, Amor Noche
Rojo, Gina
Rojo, Jarche Mae
Rojo, Teofista - sc
Romares, Crislyn
Rosales, Catherine #1
Rosales, Catherine #2
Rosario, Marcelo
Rosario, Terence #1-new
Rosario, Terence #2
Rosaut, Lucibar
Ruben, Aniceta
Ruiz, Wendel
Sabalbero, Ramon
Salonoy, Ariel
Salonoy, Zenaida
Saludar, Isa # 1
Saludar, Isa # 2
Saludar, Isa # 3
Salundagit, Elizabeth-sc
Samaco, Rochille
Samejon, Marichu
Sardual, Noemi
Sario, Ritchel
Sasing, Apolinario Jr.
Segayno, Lorna
Serad, Epifania - sc-new
Serad, Francisco
Serad, Irene
Serad, Luchie
Serad, Luisa Natividad - sc
Serad, Nelson
Serad, Nenita-sc
Serad, Porferia
Serad, Rosemarie
Serad, Ruel
Serad, Rydell
Serad, Sandra
Serad, Sarah
Serdoncillo, Marites
Sevilla, Anselmo
Siembra, Ruby
Silaya, Iryn
Socajel, Ruby
Solijon, Wilneth
Solon, Jessica
Son, Joann Marie
Sonedo, Junnel
Songkip, Amelia
Songkip, April Christine
Sumera, Lolita
Sumugat, Federico II
Suribas, Willem
Sy, Maxima #2
Taac-Taac, Delerina
Tabora, Robert Franklin
Tacsan, Ana Marie
Tagalog, Anecita-sc
Tan Ng Gui, Loraine
Taotjo, Beverly #1
Taotjo, Beverly #3
Tapdasan, Ivy Daisy
Tapil, Mark Joseph
Tautjo, Lou Doreen
Temblor, Analou
Tesio, Susan
Tinambacan, Jenelouh
Tingal, Marycries #2
Tocaldo, Alona
Tolibao, Jerry
Tongal, Lilibeth
To-ong, Almeta #2-new
To-ong, Evelyn-sc
To-ong, Ivana
To-ong, Lovella
Toong, Margeline # 1
To-ong, Mercelene
Toong, Pinky Marie
Torion, Anabel
Torion, Angeles #1
Torion, Angeles #2
Torion, Arlinda
Torion, Arlene #1
Torion, Arlene #2
Torion, Arlene #3
Torion, Belen # 1
Torion, Belen # 2-new
Torion, Belen # 3
Torion, Eladio II-new
Torion, Girly Marie
Torion, Hermelina # 1
Torion, Hermelina # 3
Torion, Jasmin
Torion, Justine Claudia
Torion, Lina Liza
Torion, Maricel
Torion, Mary Jane
Torion, Neil
Torion, Yemlyn
Torres, Flordemae (from Dexter Yray # 2)
Trazo, Sergio #2
Tribunalo, Marissa
Trocio, Herbert #1
Trocio, Herbert #2
Tullos, Chad Ahron
Tuquib, Catherine
Uypala, Annaliza
Versoza, Marilou
Villaceran, Lady Fer # 1
Villaceran, Lady Fer # 2
Villaceran, Lady Fer # 3
Villalobos, Girlie
Villegas, Claire
Wagas, Cristina # 1-sc
Wagas, Cristina # 2
Wagas, Gerardo
Waskin, Estela
Waskin, Evangeline
Waskin, Helen
Watchtower
Woodcock, Amelita
Yano, Josephine
Yray, Dexter #1
Yray, Dexter #2
Yray, Dexter #3
Yray, Emily
Yray, Nelia-new
Yray, Requel
Ysulan, Roselda
Zair, Noraisa
`.trim(),
  },
  {
    name: "San Miguel",
    barangay: "OWAK",
    municipalityCity: "ASTURIAS",
    province: "CEBU",
    lines: `
Abadinas, Alfie
Abellanosa, Jennylyn
Alcantara, Mary Kim
Alcoy, Jonathan
Alfornon, Megadalene
Apas, Maristela #1
Aplaya, Shirley-sc
Aplaya, Wenefreda
Asturias Farms # 4 - (comm.)
Avila, Noel
Ayala, Mariam
Baliguat, Alexander #2
Balolot, Juanita
Banate, Adilyn
Barreta, Dyna Marie-new
Barte, Josephine
Batalona, Clarita
Bataluna, Clarita
Bataluna, Jose
Bataluna, Michelle
Bataluna, Nenita
Baton, Jellyn
Bayona, Joean
Bernales, Adelina
Bernales, Milky
Bia, Medarda
Bocales, Adela-sc
Bocales, Dionesia
Bocales, Francis
Bocales, Isabelita # 1
Bocales, Isabelita #2
Bocales, Ma. Loida
Bocales, Melissa
Bocales, Renilda
Bocales, Rosalina
Bocales, Teodoro #1-new
Bocalis, Leonora
Bolo, Gina
Bucag, Flordecita
Bucas, Marichu
Bucas, Regelita-new
Bucog, Marlenia
Caballero, Enimela
Cabilao, Arnel
Cabilao, Ermelinda-sc
Cagadas, Emelita-new
Calo, Joan
Calo, Joelito # 2
Candol, Mary Jane
Cañada, Adeodatus
Cañada, Adelina # 1
Cañada, Lilia
Cañada, May # 2-comm.
Cañada, May #3-comm
Capablanca, Genevieve
Capangpangan, Alfonso
Capangpangan, Salome-sc
Capangpangan, Teresita
Climaco, Eva #2
Copas, Axel
Cumad, Clasil
Cumad, Princess
Cumad, Rosalie
Dala, Irene
Day Care
Decatoria, Paterno
Dela Cerna, Hedelita
Dela Cerna, Marlene
Dela Cruz, Wilfreda
Dela Peña, Semon Garry #1
Dela Peña, Semon Garry #2
Delfin, Rodjohn
Demerin, Maggi
Dumdum, Cerelie
Dumdum, Christhel
Dumdum, Diomedisa #1
Dumdum, Diones Edith
Dumdum, Jacqueline
Dumdum, Jonard
Dumdum, Joselito
Dumdum, Lorena
Dumdum, Medina - sc
Escalon, Felixberto
Escalon, Grethel
Escalon, Yolanda # 2
España, Letecia
Espejo, Rosanna
Esquila, Maria Mercy
Fajardo, Enriquita
Flores, Francisca
Gabito, Leah
Gabumpa, Mary Joy
Garbo, Christopher
Gemarino, Gilbert
Gemarino, Vivencia - sc
Gil, Susana
Guande, Lunalyn
Gulahab, Marnie
Ichikawa, Analyn # 1
Inagong, Nelly
Iway, Emily
Iway, Lolita
Jayme, Arlene
Jeres, Michelle
Jimenez, Raul
Josep, Danilo
Josep, Mary Ann
Joseph, Amelia #2
Joseph, Jeffrey
Joseph, Nomel
Julom, Luzvilla
Juntong, Analy
Juntong, Elena
Juntong, Esterlita
Juntong, Rebecca
Labating, Ophelia
Lagahit, Helen
Lambojon, Antonio Jr.
Lanoy, Berlie
Lanoy, Evelyn # 2
Lanoy, Thelma # 3
Lanza, Amalia
Lanza, Anabella # 1
Lanza, Anabella # 2
Lanza, Anabella # 3
Lanza, Carin
Lanza, Katrina
Lanza, Celso
Lanza, Jayson
Lanza, Jocelyn
Lanza, Liezl
Lanza, Meralona-new
Lanza, Susana
Lanza, Wilma
Lapetaje, Judilyn
Lapiz, Zaldy
Laurieta, Lilia
Leyson, Mercedita
Libumfacil, Juvelyn
Limpag, Antonio
Limpag, Lourdes
Lugay, Anabel
Lumuntad, Brendelyn
Macutay, Ligaya-sc
Magdadaro, Babelyn
Mahinay, Celestina
Mahinay, Cristina
Mahinay, Jesyl
Mahinay, Josefina-sc
Mahinay, Karen
Mahinay, Renante
Mahinay, Victoria-sc
Maluntad, Marlita
Manigos, Nicomedes
Manlapas, Naneth
Migallen, Elvey
Milmil, Jerry-(comm.)
Milmil, Zosimo
Mocoy, Marilou (from Montalbo, Josie)
Moises, Mae
Momo, Jesusa
Montalbo, Anecita
Montero, Gelyn
Montero, Iluminada
Montero, Leonora
Montero, Milagros
Montero, Milvie
Monteron, Rea
Montero, Villarina
Monteron, Jela
Moreno, Flora
Nara, Realyn
Narvasa, Florame
Narvasa, Michael
Natingga, Ranulfo
Navarro, Constancio
Navarro, Roselie
Navarro, Victorina
Nieves, Vivian #1
Noel, Bernardino
Obeso, Rotalyn
Ondoy, Analisa
Ondoy, Erlinda - sc
Oño, Fritzie
Oño, Marcial #1
Oño, Marcial #2
Oño, Mary Ann
Oño, Richard # 1
Oño, Richard # 2
Osorio, Jerlyn
Ostea, Jenifer
Oraño, Cerela
Pabilonia, Rowena
Pace, Rosalie # 1
Pachico, Lucia
Padal, Mary Ann
Padin, Nerissa #2
Pahal, Emarie
Pancho, Elizabeth
Papaya, Jenalyn
Paradero, Emily
Paradero, Mary Ann
Patigayon, Albert
Perales, Mardy
Piloto, Givelyn
Pitogo, Edwin
Pitogo, Lorimy
Pontillano, Geneva
Portuso, Jovey
Rabanes, Jimmy
Rabanes, Mercedita
Rabanes, Rowena
Ramos, Nixon
Redaza, Jerome
Ricaña, Ma. Antonia #1
Ricaña, Ma. Antonia #2
Ripdos, Buenaventurada
Ripdos, Pilar
Rosario, Avelina
Rosario, Rodulfo-sc
Sagolili, Manilyn
Saludar, Clavar
Saludar, Rita-sc
Samson, Proserpina
Sanson, Lovely Jane
San Rojo, Grace
San Rojo, Ma.Belen
Sarzuelo, Megelita #1
Sarzuelo, Megelita #2
Sayson, Wilma
Senanggote, Belinda
Soñedo, Antonieta
Soñedo, Isidra
Songkip, Bernadette
Songkip, Ritzie
Songkip, Sheila Marie
Surio, Dona Mae
Sy, Maxima #1-sc
Tabilon, Jenifer
Tacsan, Cindy
Tacsan, Cristita-sc
Tacsan, Eda
Tacsanan, Jacqueline
Tacsanan, Jean
Tagalog, Bienvenida #1
Tagalog, Bienvenida #2
Tagalog, Charlyn
Tagalog, Maricel
Tagalog, Liziel
Tagalog, Victor
Tamoyang, Ma. Betty
Tapil, Carmie
Tapil, Mercedita
Tapil, Pasencia-new
Tapil, Victoria # 1
Tapil, Victoria # 2
Tapil, Vilma # 1
Tapil, Vilma # 2
Tingal, Antonia
Tingal, Mary Cries
Tiro, Nemarie
Tocaldo, Rosana #1
Tocaldo, Urjelito
Tocaldo, Ursula
Tomaquin, Florenda
Torion, Diejpete #1
Torrenueva, Regelita
Trazo, Carmelita
Ulgasan, Felisa
Villamor, Patricia
Villarin, Janeth
Vocales, Lourdes
`.trim(),
  },
  {
    name: "Baybay",
    barangay: "OWAK",
    municipalityCity: "ASTURIAS",
    province: "CEBU",
    lines: `
Achapero, Joseph # 2
Alegrado, Maria Carla #1
Alegrado, Maria Carla #2
Algunas, Marilou
Ares, Janice #2
Asarcon, Elizabeth
Bacunawa, Christy (from Quilapio, Teresita)
Badili, Liberato # 2
Badili, Simona # 1
Badili, Simona #2
Badili, Gerald
Baga, Dehlia
Baguio, Expectacion # 1 - sc
Bais, Cherry
Bajamonde, Paulo
Baldisco, Alex
Baliguat, Charisma # 3
Balili, Lourdes # 2
Banate, Felix - sc
Bañez, Josephine
Baran, Mary Ann
Bardenas, Ceilito # 8
Batulan, Mae
Bayno, Ailyn
Beltran, Myrna (comm.)
Bitoon, Esperanza #1 (comm.)-new
Bitoon, Esperanza#2 (comm.)
Bitoon, Esperanza #3
Bitoon, Esperanza #4
Bitoon, Flordeliza
Bitoon, Hilda
Bitoon, Janice
Bitoon, Rosalinda # 1
Bitoon, Rosalinda # 2
Bocabal, Ricardo
Bongato, Lucena
Borromeo, Marites
Briones, Maricel
Bulahan, Wilson
Buya, Alfie
Caballes, Ludy
Cabrera, Evangeline
Cadiente, Jose Rachel
Cajote, Jerry
Cajote, Ruel
Cajote, Wilfredo Jr.
Cañete, Merlinie
Cataytay, Elna
Caton, Charabel
Codillo, Joyce Marian
Copas, Raymund
Copas, Wedelisa # 3
Copas, Wedelisa # 4
Cuñado, Aileen
Cuñado, Alicia -sc
Cuñado, Nida
Daulong, Jacqueline
Del Rosario, Greselda
Del Rosario, Remegio
Dequena, Virginia
Digal, Avelino- sc
Dolloso, Juanita
Dua, Margelita
Dumdum, Dennis
Dumdum, Vernon
Dupal-ag, John Carl #1- (comm.)-new
Dupal-ag, John Carl #2 - (comm.)
Empuerto, Lelia-sc
Encabo, Ma. Cecilia # 1
Espinosa, Rosalia
Gacasan, Nerissa
Galo, Marideth #1
Gloria, Glendel
Goc-ong, Judy
Goc-ong, Tessie
Habasa, Felipa
Jaca, Elvierosa
Jaras, Leonida-sc
Jayme, Romana
Joseph, Gloria
Lador, Manuela
Lanoy, Evelyn # 3
Lanoy, Thelma # 1
Lanza, Josefina # 2
Lanza, Madelene
Lapiña, Junlou #1
Lapiña, Junlou #2-new(comm.)
Layo, Janelle
Leyson, Antonio
Libongcogon, Ariel
Libongcogon, Hipolita # 2
Libongcogon, Hipolita #7
Libongcogon, Roland
Libongcogon, Ryan
Lombrino, Prince Aaron
Loremas, Corazon - sc
Loremas, Jocelyn-new
Love, Chalmalyn
Luceñara, Catherine
Lucob, Teresita-sc
Lumactod, Angelita - sc
Maambong, Griz
Maambong, Filma
Maambong, Ludever
Maambong, Ludrisa # 1
Maambong, Mayla
Magallon, Aurora
Maglasang, Lelita-sc
Malungtad, Josephine
Manabat, Ma. Cristy (from Manabat, Analie)
Mariano, Babelyn Lanon
Marquez, Pedina # 2 (from Maria Melone Manguray)
May, May
Moneño, Teofilo
Montero, Jhunrey #1-new (comm.)
Montero, Jhunrey # 2 (comm.)
Morales, Emily
Muzzi, Joan
Nardo, Sara
Nobleza, Suzanette-new
Nocos, Jonathan
Ocampo, Clarisse May
Ocliaso, Jecyl
Ople, Alma
Ople, Joseph
Ople, Jubert
Ople, Julito
Ople, Lorna
Ople, Lourdes
Ople, Marivic Jacobe # 1-new-sc
Ople, Marivic Jacobe # 2
Ople, Remegia
Ople, Tortillano
Ople, Wilma Lador
Pacabis, Mery
Pacquiao, Maria Angeline
Pahal, Esmeraldo
Parone, Ailene
Pastedio, Anita
Pedrana, Cristina
Pilapil, Mary Ann
Pilapil, Mildred
Pilapil, Paul Andrew
Quilapio, Glicerio Jr.
Quiñones, Marlyn
Quismundo, Tarciano-sc
Racoma, Borneo
Ramon, Pinky Jepa # 2
Ramon, Ricardo Jr.
Ranes, Beverly
Rendon, Jean
Repollo, Philip Ryan
Reyes, Maria Concepcion
Ricaplaza, Flora # 2
Ricaplaza, Marie Grace
Rosario, Eufemia
Rosario, Eufemia #2-sc
Ruben, Belen
Saballa, Mark Eugene(commercial)
Sabellano, Jerome (Sanoria, Cristita #2)
Sadura, Arlina
Sadura, Jocelyn
Sadura, Mayla #1
Sadura, Mayla #2
Sadura, Neri Boy
Salandron, Antonia
Salidaga, Felix
Sangutan, Antonia
Secuya, Leizl
Secuya, Rowena - sc
Serad, Ronniel
Serundo, Calixta
Serundo, Maricel
Songkip, Maricris
Soon, John Zantino
Soriano, Ali Leonard
Sphan, Ma. Isabel (comm.)
Suliva, Genalin
Taotjo, Beverly #2
Tautho, Lorena
Tradio, Maricris
Trocio, Mary Ann
Tugadu, Marichu
Tumamak, Reynaldo
Tuquib, Virginia
Vicada, Babyjen
Villarin, Lorna
Villarmea, Ronalyn
Villegas, Mary Josie
Yagong, Michael Joshua
`.trim(),
  },
];

// ─── Parsing ────────────────────────────────────────────────────────

// Strip the "-new" / " new" markers — they're just notes that this line
// was added recently to the ledger, not data we need to preserve.
function stripNewMarker(s) {
  return s.replace(/\s*-?\s*new\b/gi, "").trim();
}

// Detect senior-citizen flag. Removes whatever fragment matched so the
// surrounding parse doesn't get confused (e.g. "-sc" lands inside the
// "stuff after the meter index" branch).
function stripSeniorFlag(s) {
  let isSenior = false;
  const out = s.replace(/[\s-]*\(?\s*sc\s*\)?\b/gi, () => {
    isSenior = true;
    return "";
  });
  return { isSenior, rest: out.trim() };
}

// Detect commercial classification.
function stripCommercialFlag(s) {
  let isCommercial = false;
  const out = s.replace(/\s*[-]?\s*\(\s*comm(?:\.|ercial)?\s*\)/gi, () => {
    isCommercial = true;
    return "";
  });
  // bare "commercial" / "comm" not in parens, at end of string
  const out2 = out.replace(/\s+comm(?:ercial)?\b\s*$/gi, () => {
    isCommercial = true;
    return "";
  });
  return { isCommercial, rest: out2.trim() };
}

// Pull the meter index (#N) out of a name. Returns the index or 1 when
// none is present. Strips the matched piece from the string.
function stripMeterIndex(s) {
  const m = s.match(/#\s*(\d+)/);
  if (!m) return { meterIndex: 1, hasExplicitIndex: false, rest: s.trim() };
  const rest = s.slice(0, m.index).trim() + s.slice(m.index + m[0].length).trim();
  return { meterIndex: parseInt(m[1], 10), hasExplicitIndex: true, rest: rest.replace(/\s+/g, " ").trim() };
}

// Pull a sub-name from the LAST parenthesised group, if any. We do NOT
// treat "(from <something>)" as a sub-name — that's a provenance note
// the bookkeeper kept when meters were moved between accounts.
function stripSubName(s) {
  // Find ALL parenthesised groups; pick the last that isn't a note.
  const parens = [];
  const re = /\(([^()]+)\)/g;
  let m;
  while ((m = re.exec(s)) !== null) parens.push({ raw: m[0], inner: m[1].trim(), start: m.index });
  let subName = "";
  let note = "";
  for (const p of parens) {
    if (/^from\b/i.test(p.inner)) {
      note = p.inner;
    } else {
      subName = p.inner;
    }
  }
  // Strip every parenthesised group from the original string so the
  // remainder is the clean name.
  const rest = s.replace(/\([^()]*\)/g, "").replace(/\s+/g, " ").trim();
  return { subName, note, rest };
}

// Canonical form of an account: strip meter index + flags + parens so
// that all meter-rows for the same account fold into one key.
function canonicalAccountKey(line) {
  let s = stripNewMarker(line);
  s = stripSeniorFlag(s).rest;
  s = stripCommercialFlag(s).rest;
  s = stripSubName(s).rest;
  s = stripMeterIndex(s).rest;
  // Trailing punctuation cleanup
  return s.replace(/[\s\-,]+$/g, "").trim();
}

// Parse one row into { accountName, meterIndex, subName, isSenior, isCommercial, note, originalLine }.
function parseLine(rawLine) {
  let s = stripNewMarker(rawLine);
  const seniorPass = stripSeniorFlag(s);
  s = seniorPass.rest;
  const commPass = stripCommercialFlag(s);
  s = commPass.rest;
  const subPass = stripSubName(s);
  s = subPass.rest;
  const meterPass = stripMeterIndex(s);
  const accountName = meterPass.rest.replace(/[\s\-,]+$/g, "").trim();
  return {
    accountName,
    meterIndex: meterPass.meterIndex,
    hasExplicitIndex: meterPass.hasExplicitIndex,
    subName: subPass.subName,
    note: subPass.note,
    isSenior: seniorPass.isSenior,
    isCommercial: commPass.isCommercial,
    originalLine: rawLine.trim(),
  };
}

// ─── ID generators ──────────────────────────────────────────────────

const PN_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // skip 0/O/1/I to avoid OCR confusion
function generatePnNo() {
  let s = "";
  for (let i = 0; i < 6; i++) s += PN_CHARS[Math.floor(Math.random() * PN_CHARS.length)];
  return s;
}

function generateMeterBase() {
  return String(10000 + Math.floor(Math.random() * 90000));
}

// ─── Main ───────────────────────────────────────────────────────────

async function run() {
  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI is not set. Aborting.");
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB.");

  // Pre-load the pnNos already on file so we don't reuse one by accident.
  const existingPnNos = new Set((await WaterMember.find({}).select("pnNo").lean()).map((m) => m.pnNo));

  let inserted = 0;
  let skipped = 0;
  let failed = 0;

  for (const sitio of SITIOS) {
    console.log(`\n=== Sitio: ${sitio.name} ===`);
    const parsed = sitio.lines
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .filter((l) => !/^nd$/i.test(l)) // stray "nd" artifact in source
      .map(parseLine);

    // Fold multiple meter rows for the same head-of-household into one
    // account, preserving order so meterIndex matches the ledger.
    const byCanon = new Map();
    for (const row of parsed) {
      const key = canonicalAccountKey(row.originalLine);
      if (!byCanon.has(key)) byCanon.set(key, []);
      byCanon.get(key).push(row);
    }

    for (const [canon, rows] of byCanon) {
      try {
        // Use the FIRST row's parsed accountName as the canonical name.
        const accountName = rows[0].accountName || canon;
        if (!accountName) {
          console.warn(`  ⚠ Empty account name for canonical key "${canon}", skipping.`);
          continue;
        }

        // Skip if already imported (idempotent re-runs).
        const dupe = await WaterMember.findOne({
          accountName,
          "address.streetSitioPurok": sitio.name,
        })
          .select("_id")
          .lean();
        if (dupe) {
          skipped++;
          continue;
        }

        // Account-level flags: senior or commercial on ANY meter row
        // propagates to the account.
        const anySenior = rows.some((r) => r.isSenior);
        const anyCommercial = rows.some((r) => r.isCommercial);

        // Generate unique pnNo.
        let pnNo;
        for (let i = 0; i < 20; i++) {
          pnNo = generatePnNo();
          if (!existingPnNos.has(pnNo)) break;
        }
        if (existingPnNos.has(pnNo)) throw new Error("pnNo space exhausted");
        existingPnNos.add(pnNo);

        // Shared 5-digit base per account; per-meter "#N" suffix from
        // the parsed meter index.
        const meterBase = generateMeterBase();
        const meters = rows.map((r, idx) => {
          const idxN = r.hasExplicitIndex ? r.meterIndex : idx + 1;
          return {
            meterNumber: `${meterBase}#${idxN}`,
            meterStatus: "active",
            isBillingActive: true,
            billingSequence: idx,
            subName: r.subName || "",
            isDiscountMeter: r.isSenior,
            meterReaderNotes: r.note ? `Migrated: ${r.note}` : "",
          };
        });

        const notesLines = [];
        if (rows.some((r) => r.note)) {
          notesLines.push(...rows.filter((r) => r.note).map((r) => `${accountName} — ${r.note}`));
        }
        notesLines.push("Imported from legacy ledger.");

        const doc = new WaterMember({
          pnNo,
          accountName,
          accountType: /(school|academy|farms|barangay|office|inc|hall|watchtower|nia|cebeco|pablotuda|silofa|dsn|center)/i.test(accountName)
            ? "institution"
            : "individual",
          accountStatus: "active",
          isExistingMember: true,
          personal: {
            fullName: accountName,
            gender: "other",
            birthdate: "",
            dateRegistered: new Date(),
            isSeniorCitizen: anySenior,
          },
          address: {
            streetSitioPurok: sitio.name,
            barangay: sitio.barangay,
            municipalityCity: sitio.municipalityCity,
            province: sitio.province,
          },
          contact: { mobileNumber: "", email: "", mobileNumber2: "" },
          billing: {
            classification: anyCommercial ? "commercial" : "residential",
            hasSeniorDiscount: anySenior,
          },
          meters,
          notes: notesLines.join("\n"),
        });

        await doc.save();
        inserted++;
        console.log(`  ✓ ${pnNo}  ${accountName}  (${meters.length} meter${meters.length === 1 ? "" : "s"}${anySenior ? ", SC" : ""}${anyCommercial ? ", COMM" : ""})`);
      } catch (e) {
        failed++;
        console.error(`  ✗ Failed for "${canon}":`, e.message);
      }
    }
  }

  console.log(`\nDone. inserted=${inserted}  skipped=${skipped}  failed=${failed}`);
  await mongoose.disconnect();
}

run().catch((e) => {
  console.error("Import crashed:", e);
  process.exit(1);
});
