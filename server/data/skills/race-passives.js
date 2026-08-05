// ============================================================
// สกิลติดตัวประจำเผ่า (race passives)
// ============================================================

const DND_RACE_PASSIVES = {
  human: [
    { key: 'skilled',     name: 'ผู้ชำนาญรอบด้าน', icon: '🎯', desc: 'ปรับตัวเก่ง เรียนรู้ไว จับจังหวะโจมตีแม่นกว่าเผ่าอื่น (โจมตี +1)', effect: { atk: 1 } },
    { key: 'resourceful', name: 'มีไหวพริบ',       icon: '💰', desc: 'รู้จักตุนเสบียงและเงินทองมาตั้งแต่ออกเดินทาง (ทองเริ่มต้น +15)', effect: { gold: 15 } },
  ],
  elf: [
    { key: 'feyAncestry', name: 'สายเลือดภูตพราย', icon: '🌙', desc: 'ประสาทสัมผัสไวจนยากจะจู่โจมแบบไม่ทันตั้งตัว (ช่วงคริติคอลกว้างขึ้น 19-20)', effect: { critRange: 1 } },
    { key: 'keenSenses',  name: 'สัมผัสคมกริบ',    icon: '👁️', desc: 'สายตาและปฏิกิริยาไวกว่าเผ่าพันธุ์อื่น (โจมตี +1)', effect: { atk: 1 } },
  ],
  dwarf: [
    { key: 'resilience',   name: 'ความทรหดแห่งดวาร์ฟ', icon: '❤️', desc: 'ร่างกายแข็งแกร่งทนทานผิดมนุษย์ (HP สูงสุด +5)', effect: { hp: 5 } },
    { key: 'stonecunning', name: 'ปราดเปรื่องเรื่องหิน', icon: '🛡️', desc: 'สัญชาตญาณป้องกันตัวเยี่ยมจากการใช้ชีวิตใต้ภูเขา (ป้องกัน +1)', effect: { ac: 1 } },
  ],
  halfling: [
    { key: 'lucky', name: 'โชคดีที่สุด', icon: '🍀', desc: 'ดวงดีเป็นพิเศษ มักเจอจังหวะติดพันสำคัญ ๆ (ช่วงคริติคอลกว้างขึ้น 19-20)', effect: { critRange: 1 } },
    { key: 'brave', name: 'กล้าหาญ',   icon: '💪', desc: 'ใจสู้ไม่หวั่นแม้ตัวเล็ก ทนทานกว่าที่คิด (HP สูงสุด +3)', effect: { hp: 3 } },
  ],
  orc: [
    { key: 'relentless',  name: 'ทรหดไม่ย่อท้อ',  icon: '❤️', desc: 'ร่างกายที่ผ่านศึกมานับไม่ถ้วน ทนทานผิดมนุษย์ (HP สูงสุด +8)', effect: { hp: 8 } },
    { key: 'aggressive',  name: 'ดุดันในสนามรบ',  icon: '🔥', desc: 'พลังบุกตะลุยทำให้โจมตีแรงขึ้น (ดาเมจ +2)', effect: { dmg: 2 } },
  ],
  tiefling: [
    { key: 'infernalLegacy', name: 'มรดกปีศาจ',     icon: '🔥', desc: 'สายเลือดปีศาจซ่อนพลังทำลายล้างในตัว (ดาเมจ +2)', effect: { dmg: 2 } },
    { key: 'hellishResist',  name: 'ทนต่อพลังนรก', icon: '🛡️', desc: 'ผิวหนังต้านทานพลังชั่วร้ายได้ดีกว่าปกติ (ป้องกัน +1)', effect: { ac: 1 } },
  ],
  gnome: [
    { key: 'gnomeCunning', name: 'ไหวพริบแห่งโนม', icon: '🎯', desc: 'จิตใจแหลมคม จับจังหวะโจมตีได้แม่นยำ (โจมตี +1)', effect: { atk: 1 } },
    { key: 'tinker',       name: 'ช่างประดิษฐ์',   icon: '💰', desc: 'พกอุปกรณ์และเงินทุนสำรองติดตัวเสมอ (ทองเริ่มต้น +20)', effect: { gold: 20 } },
  ],
  dragonborn: [
    { key: 'breathWeapon',      name: 'ลมหายใจมังกร',     icon: '🔥', desc: 'สายเลือดมังกรซ่อนพลังทำลายล้างในทุกการโจมตี (ดาเมจ +3)', effect: { dmg: 3 } },
    { key: 'draconicResilience', name: 'ความทรหดแห่งมังกร', icon: '❤️', desc: 'เกล็ดมังกรใต้ผิวหนังช่วยเสริมความอึด (HP สูงสุด +5)', effect: { hp: 5 } },
  ],
  medusa: [
    { key: 'petrifyingGaze', name: 'สายตาสะกดวิญญาณ', icon: '👁️', desc: 'แค่สบตาก็ทำให้ศัตรูเสียจังหวะ จับช่องโหว่ได้แม่นยำ (ช่วงคริติคอลกว้างขึ้น 19-20)', effect: { critRange: 1 } },
    { key: 'scaledSkin',     name: 'เกล็ดงูหุ้มกาย',   icon: '🐍', desc: 'ผิวหนังปกคลุมด้วยเกล็ดแข็ง ป้องกันการโจมตีได้ดีกว่าปกติ (ป้องกัน +1)', effect: { ac: 1 } },
  ],
  aasimar: [
    { key: 'radiantSoul',  name: 'จิตวิญญาณเรืองแสง', icon: '✨', desc: 'พลังศักดิ์สิทธิ์จากสายเลือดเทวะแผ่ซ่านออกมาตอนโจมตี (ดาเมจ +2)', effect: { dmg: 2 } },
    { key: 'healingHands', name: 'สัมผัสแห่งการเยียวยา', icon: '💫', desc: 'พรสวรรค์ในการรักษาทำให้ร่างกายฟื้นตัวได้ดีกว่าปกติ (HP สูงสุด +4)', effect: { hp: 4 } },
  ],
  goliath: [
    { key: 'stonesEndurance', name: 'ความทรหดแห่งขุนเขา', icon: '🗿', desc: 'ร่างกายบึกบึนดุจหินผา ทนทานต่อบาดแผลผิดมนุษย์ (HP สูงสุด +6)', effect: { hp: 6 } },
    { key: 'powerfulBuild',   name: 'รูปร่างทรงพลัง',     icon: '💪', desc: 'พละกำลังมหาศาลของยักษ์เขาทำให้การโจมตีหนักหน่วงกว่าเดิม (ดาเมจ +2)', effect: { dmg: 2 } },
  ],
  halfElf: [
    { key: 'dualHeritage', name: 'สายเลือดคู่',       icon: '🌗', desc: 'มรดกจากทั้งมนุษย์และเอลฟ์ทำให้ปรับตัวเก่งกว่าใคร (โจมตี +1)', effect: { atk: 1 } },
    { key: 'feyCharm',     name: 'เสน่ห์แห่งภูตพราย', icon: '💫', desc: 'เสน่ห์ล้ำลึกทำให้ต่อรองราคาได้ดีกว่าปกติ (ทองเริ่มต้น +10)', effect: { gold: 10 } },
  ],
  halfOrc: [
    { key: 'relentlessEndurance', name: 'ทรหดไม่ยอมแพ้', icon: '❤️', desc: 'แม้บาดเจ็บหนักก็ยังยืนหยัดสู้ต่อได้ (HP สูงสุด +6)', effect: { hp: 6 } },
    { key: 'savageAttacks',       name: 'โจมตีป่าเถื่อน',  icon: '🔥', desc: 'สายเลือดออร์คทำให้โจมตีดุดันกว่าปกติ (ดาเมจ +2)', effect: { dmg: 2 } },
  ],
  aarakocra: [
    { key: 'talonStrike',     name: 'กรงเล็บเฉียบคม',   icon: '🦅', desc: 'กรงเล็บแหลมคมช่วยจิกโจมตีได้แม่นยำ (โจมตี +1)', effect: { atk: 1 } },
    { key: 'aerialInstinct',  name: 'สัญชาตญาณนักบิน', icon: '🌬️', desc: 'ความคล่องตัวในอากาศทำให้หลบหลีกได้ดีกว่าปกติ (ป้องกัน +1)', effect: { ac: 1 } },
  ],
  astralElf: [
    { key: 'starlightStep', name: 'ก้าวแสงดาว',     icon: '✨', desc: 'พลังจากภาคพื้นดาราช่วยให้จับจังหวะโจมตีแม่น (โจมตี +1)', effect: { atk: 1 } },
    { key: 'astralTrance',  name: 'ภวังค์ดาราจักร', icon: '🌌', desc: 'การพักภวังค์ช่วยฟื้นฟูร่างกายได้ดีกว่าปกติ (HP สูงสุด +3)', effect: { hp: 3 } },
  ],
  autognome: [
    { key: 'builtForSuccess', name: 'สร้างมาเพื่อชัยชนะ', icon: '🎯', desc: 'กลไกภายในช่วยปรับแก้การกระทำให้แม่นยำขึ้น (โจมตี +1)', effect: { atk: 1 } },
    { key: 'metalBody',       name: 'ร่างกายโลหะ',       icon: '🛡️', desc: 'ร่างกายที่สร้างจากโลหะแข็งแกร่งป้องกันได้ดีกว่าปกติ (ป้องกัน +1)', effect: { ac: 1 } },
  ],
  bugbear: [
    { key: 'surpriseAttack', name: 'จู่โจมไม่ทันตั้งตัว', icon: '🗡️', desc: 'แขนขนยาวช่วยให้จู่โจมได้ไกลและแรงกว่าปกติ (ดาเมจ +2)', effect: { dmg: 2 } },
    { key: 'longLimbed',     name: 'แขนขายาว',         icon: '💪', desc: 'รูปร่างสูงใหญ่กำยำทำให้ทนทานกว่าปกติ (HP สูงสุด +4)', effect: { hp: 4 } },
  ],
  centaur: [
    { key: 'hoovesKick', name: 'เตะด้วยกีบ',        icon: '🐴', desc: 'กีบแข็งแรงช่วยเสริมแรงโจมตี (ดาเมจ +2)', effect: { dmg: 2 } },
    { key: 'charge',     name: 'พุ่งชนสายฟ้าแลบ',   icon: '🏃', desc: 'ร่างกึ่งม้าเคลื่อนที่เร็วจนเปิดช่องโจมตีได้ถนัดกว่าปกติ (โจมตี +1)', effect: { atk: 1 } },
  ],
  changeling: [
    { key: 'disguiseSelf', name: 'พรางกายไร้ที่ติ', icon: '🎭', desc: 'ปลอมตัวได้แนบเนียนจนศัตรูจับช่องโหว่ไม่ทัน (ช่วงคริติคอลกว้างขึ้น 19-20)', effect: { critRange: 1 } },
    { key: 'silverTongue', name: 'ลิ้นเงินคำ',     icon: '💰', desc: 'พูดจาหว่านล้อมจนต่อรองราคาได้เก่ง (ทองเริ่มต้น +15)', effect: { gold: 15 } },
  ],
  deepGnome: [
    { key: 'svirfneblinCamouflage', name: 'พรางกายใต้ธรณี', icon: '🌑', desc: 'ความชำนาญในการซ่อนตัวใต้ดินช่วยจับจังหวะโจมตีแม่น (โจมตี +1)', effect: { atk: 1 } },
    { key: 'stoneCamouflage',       name: 'เกราะหินพราง',   icon: '🪨', desc: 'ผิวสีเทาคล้ายหินช่วยป้องกันการถูกโจมตี (ป้องกัน +1)', effect: { ac: 1 } },
  ],
  dhampir: [
    { key: 'vampiricBite',    name: 'กัดดูดเลือด',   icon: '🦇', desc: 'เขี้ยวแหลมคมช่วยดูดพลังชีวิตเมื่อโจมตี (ดาเมจ +2)', effect: { dmg: 2 } },
    { key: 'undeadResilience', name: 'ร่างกึ่งอมตะ', icon: '❤️', desc: 'สายเลือดกึ่งอมตะทำให้ทนทานกว่ามนุษย์ปกติ (HP สูงสุด +3)', effect: { hp: 3 } },
  ],
  duergar: [
    { key: 'duergarMagic',     name: 'เวทมนตร์ดูเออร์การ์', icon: '🔮', desc: 'พลังเวทซ่อนอยู่ในสายเลือดช่วยเสริมโจมตี (ดาเมจ +2)', effect: { dmg: 2 } },
    { key: 'dwarvenResilience', name: 'ความทรหดใต้ธรณี',    icon: '🛡️', desc: 'ชีวิตใต้ Underdark ทำให้ป้องกันตัวได้ดีกว่าปกติ (ป้องกัน +1)', effect: { ac: 1 } },
  ],
  eladrin: [
    { key: 'feySeasons', name: 'ฤดูกาลแห่งเฟย์', icon: '🍂', desc: 'พลังจากฤดูกาลประจำตัวช่วยให้จับจังหวะโจมตีแม่น (โจมตี +1)', effect: { atk: 1 } },
    { key: 'fadeStep',   name: 'ก้าวเลือนหาย',   icon: '💨', desc: 'สามารถเคลื่อนที่เลือนหายจนหลบการโจมตีได้ดีกว่าปกติ (ป้องกัน +1)', effect: { ac: 1 } },
  ],
  fairy: [
    { key: 'faerieFire', name: 'เพลิงภูต',        icon: '🔥', desc: 'เวทมนตร์เพลิงภูตติดตัวช่วยเสริมพลังโจมตี (ดาเมจ +2)', effect: { dmg: 2 } },
    { key: 'flight',     name: 'ปีกน้อยมหัศจรรย์', icon: '🦋', desc: 'ปีกช่วยให้หลบหลีกการโจมตีได้คล่องแคล่ว (ป้องกัน +1)', effect: { ac: 1 } },
  ],
  firbolg: [
    { key: 'invisibility',  name: 'ล่องหนชั่วครู่', icon: '👻', desc: 'พลังจากป่าลึกช่วยหลบหนีจากอันตราย (ป้องกัน +1)', effect: { ac: 1 } },
    { key: 'giantAncestry', name: 'สายเลือดยักษ์', icon: '💪', desc: 'ร่างกายใหญ่โตแฝงพลังจากบรรพบุรุษยักษ์ (ดาเมจ +2)', effect: { dmg: 2 } },
  ],
  genasi: [
    { key: 'elementalHeritage',   name: 'มรดกธาตุ',   icon: '🔥', desc: 'พลังธาตุในสายเลือดช่วยเสริมโจมตี (ดาเมจ +2)', effect: { dmg: 2 } },
    { key: 'elementalResistance', name: 'ต้านทานธาตุ', icon: '🛡️', desc: 'ร่างกายต้านทานพลังธาตุตามสายเลือด (ป้องกัน +1)', effect: { ac: 1 } },
  ],
  giff: [
    { key: 'astralSpark', name: 'ประกายดาราจักร', icon: '⚡', desc: 'พลังจากห้วงอวกาศเสริมแรงโจมตีอาวุธ (ดาเมจ +2)', effect: { dmg: 2 } },
    { key: 'hippoHide',   name: 'หนังฮิปโปหนา',   icon: '🛡️', desc: 'หนังหนาราวหินผาช่วยทนทานต่อการโจมตี (HP สูงสุด +5)', effect: { hp: 5 } },
  ],
  githyanki: [
    { key: 'astralKnowledge', name: 'ปัญญาแห่งภาคพื้นดารา', icon: '📚', desc: 'ความรู้จากการท่องภาคพื้นดาราช่วยจับจังหวะโจมตีแม่น (โจมตี +1)', effect: { atk: 1 } },
    { key: 'silverBlade',     name: 'ดาบเงินกิธยันกิ',    icon: '⚔️', desc: 'ฝึกฝนการรบมาอย่างโชกโชนทำให้โจมตีหนักหน่วง (ดาเมจ +2)', effect: { dmg: 2 } },
  ],
  githzerai: [
    { key: 'psionicShield',   name: 'เกราะจิต',       icon: '🧠', desc: 'พลังจิตปกป้องจากอันตรายภายนอก (ป้องกัน +1)', effect: { ac: 1 } },
    { key: 'mentalDiscipline', name: 'วินัยแห่งจิต',  icon: '🎯', desc: 'การฝึกจิตอย่างเข้มงวดช่วยจับจังหวะโจมตีแม่นยำ (โจมตี +1)', effect: { atk: 1 } },
  ],
  goblin: [
    { key: 'nimbleEscape',   name: 'หลบหลีกไว',   icon: '🏃', desc: 'ตัวเล็กไวทำให้หลบการโจมตีได้ดีกว่าปกติ (ป้องกัน +1)', effect: { ac: 1 } },
    { key: 'furyOfTheSmall', name: 'พลังตัวจิ๋ว', icon: '🔥', desc: 'พลังจากความแค้นตัวเล็กช่วยเสริมดาเมจต่อศัตรูตัวใหญ่ (ดาเมจ +2)', effect: { dmg: 2 } },
  ],
  hadozee: [
    { key: 'glide',        name: 'ร่อนลม',         icon: '🪂', desc: 'พังผืดใต้แขนช่วยหลบหลีกได้คล่องแคล่ว (ป้องกัน +1)', effect: { ac: 1 } },
    { key: 'hadozeeDodge', name: 'หลบหลีกแฮโดซี', icon: '🤸', desc: 'สัญชาตญาณนักไต่ต้นไม้ช่วยจับจังหวะโจมตีแม่นยำ (โจมตี +1)', effect: { atk: 1 } },
  ],
  harengon: [
    { key: 'hareTrigger',    name: 'ไหวตัวไว',   icon: '⚡', desc: 'สัญชาตญาณกระต่ายทำให้จับจังหวะโจมตีแม่นยำ (โจมตี +1)', effect: { atk: 1 } },
    { key: 'luckyFootwork',  name: 'เท้าโชคดี',   icon: '🍀', desc: 'จังหวะเท้าที่คล่องแคล่วช่วยเพิ่มโอกาสจังหวะสำคัญ (ช่วงคริติคอลกว้างขึ้น 19-20)', effect: { critRange: 1 } },
  ],
  hexblood: [
    { key: 'hagMagic',           name: 'เวทมนตร์แม่มด',   icon: '🔮', desc: 'พลังเวทจากแฮกเสริมความรุนแรงในการโจมตี (ดาเมจ +2)', effect: { dmg: 2 } },
    { key: 'hexbloodResilience', name: 'ร่างกึ่งแฮก',     icon: '❤️', desc: 'การถูกแปรสภาพด้วยเวทมนตร์ทำให้ทนทานกว่าปกติ (HP สูงสุด +4)', effect: { hp: 4 } },
  ],
  hobgoblin: [
    { key: 'feyGift',          name: 'ของขวัญจากเฟย์',   icon: '🎁', desc: 'พรจากเฟย์ไวลด์ช่วยจับจังหวะโจมตีแม่นยำ (โจมตี +1)', effect: { atk: 1 } },
    { key: 'fortuneFromMany',  name: 'โชคจากหมู่คณะ',   icon: '🍀', desc: 'ความสามัคคีในหมู่คณะทำให้ทนทานกว่าปกติ (HP สูงสุด +5)', effect: { hp: 5 } },
  ],
  kalashtar: [
    { key: 'mindLink',     name: 'สายใยจิต',       icon: '🧠', desc: 'พลังจิตจากภาคพื้นฝันช่วยป้องกันอันตราย (ป้องกัน +1)', effect: { ac: 1 } },
    { key: 'dreamSpirit',  name: 'วิญญาณแห่งฝัน', icon: '✨', desc: 'สายเลือดแห่งฝันช่วยเสริมพลังโจมตี (ดาเมจ +2)', effect: { dmg: 2 } },
  ],
  kender: [
    { key: 'fearlessCourage', name: 'ใจกล้าไร้ความกลัว', icon: '💪', desc: 'ความกล้าหาญทำให้ทนทานกว่าปกติ (HP สูงสุด +3)', effect: { hp: 3 } },
    { key: 'taunt',            name: 'ยั่วยุ',            icon: '🎯', desc: 'ความคล่องแคล่วในการล่อเป้าช่วยจับจังหวะโจมตีแม่นยำ (โจมตี +1)', effect: { atk: 1 } },
  ],
  kenku: [
    { key: 'mimicry',       name: 'เลียนเสียง',     icon: '🎭', desc: 'ความสามารถเลียนแบบช่วยพรางจังหวะโจมตี (ช่วงคริติคอลกว้างขึ้น 19-20)', effect: { critRange: 1 } },
    { key: 'expertForgery', name: 'ทักษะเลียนแบบ', icon: '✍️', desc: 'ความจำเป็นเลิศช่วยให้ต่อรองราคาได้ดี (ทองเริ่มต้น +10)', effect: { gold: 10 } },
  ],
  kobold: [
    { key: 'draconicCry',  name: 'เสียงร้องแห่งมังกร', icon: '📣', desc: 'เสียงร้องปลุกใจพันธมิตรช่วยจับจังหวะโจมตี (โจมตี +1)', effect: { atk: 1 } },
    { key: 'packTactics',  name: 'ยุทธวิธีฝูง',       icon: '🐾', desc: 'สัญชาตญาณล่าเป็นฝูงทำให้โจมตีได้แรงขึ้น (ดาเมจ +2)', effect: { dmg: 2 } },
  ],
  leonin: [
    { key: 'clawsAttack',  name: 'กรงเล็บสิงโต',      icon: '🐾', desc: 'กรงเล็บแหลมคมช่วยเสริมพลังโจมตี (ดาเมจ +2)', effect: { dmg: 2 } },
    { key: 'dauntingRoar', name: 'เสียงคำรามข่มขวัญ', icon: '🦁', desc: 'เสียงคำรามทรงพลังช่วยข่มขวัญศัตรูจนเปิดช่องโจมตี (โจมตี +1)', effect: { atk: 1 } },
  ],
  lizardfolk: [
    { key: 'bite',          name: 'กัดด้วยเขี้ยว',   icon: '🦷', desc: 'เขี้ยวแหลมคมและการกัดกินช่วยฟื้นฟูร่างกาย (HP สูงสุด +4)', effect: { hp: 4 } },
    { key: 'naturalArmor',  name: 'เกราะธรรมชาติ',   icon: '🛡️', desc: 'เกล็ดหนาปกคลุมผิวหนังช่วยป้องกันการโจมตี (ป้องกัน +1)', effect: { ac: 1 } },
  ],
  loxodon: [
    { key: 'trunkStrike',      name: 'งวงทรงพลัง',     icon: '🐘', desc: 'งวงหนาช่วยฟาดโจมตีได้หนักหน่วง (ดาเมจ +2)', effect: { dmg: 2 } },
    { key: 'naturalArmorLox',  name: 'ผิวหนังหนา',     icon: '🛡️', desc: 'ผิวหนังหนาราวเกราะช่วยป้องกันได้ดีกว่าปกติ (ป้องกัน +1)', effect: { ac: 1 } },
  ],
  minotaur: [
    { key: 'hornsAttack',        name: 'เขาแหลมพุ่งชน',   icon: '🐂', desc: 'เขาแข็งแกร่งช่วยเสริมแรงโจมตี (ดาเมจ +3)', effect: { dmg: 3 } },
    { key: 'labyrinthineRecall', name: 'ความจำเขาวงกต',  icon: '🧭', desc: 'สัญชาตญาณนำทางที่เฉียบคมช่วยจับจังหวะโจมตี (โจมตี +1)', effect: { atk: 1 } },
  ],
  owlin: [
    { key: 'flightOwlin',    name: 'ปีกนกฮูก',     icon: '🦉', desc: 'ปีกช่วยให้บินหลบหลีกได้คล่องแคล่ว (ป้องกัน +1)', effect: { ac: 1 } },
    { key: 'silentFeathers', name: 'ขนนกไร้เสียง', icon: '🌙', desc: 'บินและซุ่มโจมตีอย่างเงียบเชียบ (ช่วงคริติคอลกว้างขึ้น 19-20)', effect: { critRange: 1 } },
  ],
  plasmoid: [
    { key: 'amorphous',       name: 'ร่างไร้รูปทรง',   icon: '🫧', desc: 'ร่างกายที่ไร้รูปทรงตายตัวช่วยหลบหลีกได้ดีกว่าปกติ (ป้องกัน +1)', effect: { ac: 1 } },
    { key: 'pseudopodStrike', name: 'หนวดเมือกโจมตี', icon: '🟢', desc: 'หนวดเมือกยืดหยุ่นช่วยเสริมแรงโจมตี (ดาเมจ +2)', effect: { dmg: 2 } },
  ],
  reborn: [
    { key: 'undyingWill',      name: 'เจตจำนงอมตะ',            icon: '❤️', desc: 'ร่างที่ผ่านความตายมาแล้วทนทานกว่าปกติ (HP สูงสุด +5)', effect: { hp: 5 } },
    { key: 'deathlessResolve', name: 'ความมุ่งมั่นเหนือความตาย', icon: '🎯', desc: 'ความไม่กลัวตายทำให้จับจังหวะโจมตีแม่นยำ (โจมตี +1)', effect: { atk: 1 } },
  ],
  satyr: [
    { key: 'ramAttack',       name: 'พุ่งชนด้วยเขา',   icon: '🐐', desc: 'เขาแพะแข็งแรงช่วยเสริมแรงโจมตี (ดาเมจ +2)', effect: { dmg: 2 } },
    { key: 'magicResistance', name: 'ต้านทานเวทมนตร์', icon: '🛡️', desc: 'สายเลือดเฟย์ต้านทานเวทมนตร์ช่วยป้องกันตัว (ป้องกัน +1)', effect: { ac: 1 } },
  ],
  seaElf: [
    { key: 'aquaticAgility', name: 'ปราดเปรียวใต้น้ำ',    icon: '🌊', desc: 'ความคล่องตัวในน้ำช่วยจับจังหวะโจมตีแม่นยำ (โจมตี +1)', effect: { atk: 1 } },
    { key: 'friendOfSea',    name: 'มิตรแห่งท้องทะเล', icon: '🐚', desc: 'สายเลือดแห่งท้องทะเลช่วยเสริมความทนทาน (HP สูงสุด +3)', effect: { hp: 3 } },
  ],
  shadarKai: [
    { key: 'ravenBlessing', name: 'พรแห่งราชินีอีกา', icon: '🐦‍⬛', desc: 'พรจากราชินีอีกาช่วยหลบหลีกอันตราย (ป้องกัน +1)', effect: { ac: 1 } },
    { key: 'shadowStrike',  name: 'โจมตีจากเงามืด',   icon: '🌑', desc: 'สายเลือดแห่งเงามืดช่วยเสริมแรงโจมตี (ดาเมจ +2)', effect: { dmg: 2 } },
  ],
  shifter: [
    { key: 'beastform', name: 'ร่างสัตว์ป่า', icon: '🐺', desc: 'สายเลือดสัตว์ป่าซ่อนพลังในการโจมตี (ดาเมจ +2)', effect: { dmg: 2 } },
    { key: 'longtooth', name: 'เขี้ยวยาว',   icon: '🦷', desc: 'เขี้ยวแหลมคมช่วยจับจังหวะโจมตีแม่นยำ (โจมตี +1)', effect: { atk: 1 } },
  ],
  simicHybrid: [
    { key: 'aquaticTraits', name: 'คุณสมบัติสัตว์น้ำ', icon: '🐸', desc: 'ลักษณะผสมสัตว์น้ำช่วยป้องกันตัวได้ดีกว่าปกติ (ป้องกัน +1)', effect: { ac: 1 } },
    { key: 'acidSpray',     name: 'พ่นกรด',            icon: '🧪', desc: 'ต่อมพิเศษช่วยพ่นกรดเสริมพลังโจมตี (ดาเมจ +2)', effect: { dmg: 2 } },
  ],
  tabaxi: [
    { key: 'catsClaws',       name: 'กรงเล็บแมว',        icon: '🐾', desc: 'กรงเล็บแหลมคมช่วยเสริมแรงโจมตี (ดาเมจ +2)', effect: { dmg: 2 } },
    { key: 'featherFallLeap', name: 'กระโดดไวปราดเปรียว', icon: '🏃', desc: 'ความปราดเปรียวแบบแมวช่วยจับจังหวะโจมตี (โจมตี +1)', effect: { atk: 1 } },
  ],
  thriKreen: [
    { key: 'secondaryArms', name: 'แขนคู่ที่สอง', icon: '🦗', desc: 'แขนพิเศษช่วยจับจังหวะโจมตีได้แม่นยำกว่าเดิม (โจมตี +1)', effect: { atk: 1 } },
    { key: 'chitinArmor',   name: 'เปลือกไคติน', icon: '🛡️', desc: 'เปลือกแข็งหุ้มร่างกายช่วยป้องกันการโจมตี (ป้องกัน +1)', effect: { ac: 1 } },
  ],
  tortle: [
    { key: 'shellDefense',     name: 'ป้องกันด้วยกระดอง',   icon: '🐢', desc: 'กระดองแข็งแกร่งช่วยป้องกันการโจมตีได้ดีกว่าปกติ (ป้องกัน +2)', effect: { ac: 2 } },
    { key: 'naturalArmorShell', name: 'เกราะธรรมชาติแข็งแกร่ง', icon: '🛡️', desc: 'ผิวหนังหนาราวหินผาช่วยเสริมความทนทาน (HP สูงสุด +4)', effect: { hp: 4 } },
  ],
  triton: [
    { key: 'guardianOfDepths', name: 'ผู้พิทักษ์ห้วงลึก', icon: '🔱', desc: 'สายเลือดผู้พิทักษ์ทะเลลึกช่วยป้องกันตัว (ป้องกัน +1)', effect: { ac: 1 } },
    { key: 'controlWater',     name: 'ควบคุมสายน้ำ',    icon: '🌊', desc: 'พลังควบคุมน้ำช่วยเสริมแรงโจมตี (ดาเมจ +2)', effect: { dmg: 2 } },
  ],
  vedalken: [
    { key: 'partitionedMind', name: 'จิตแบ่งภาค',   icon: '🧠', desc: 'จิตใจที่แบ่งภาคได้ช่วยต้านทานและป้องกันตัว (ป้องกัน +1)', effect: { ac: 1 } },
    { key: 'preciseThinking', name: 'ความคิดแม่นยำ', icon: '🎯', desc: 'การคำนวณอย่างแม่นยำช่วยจับจังหวะโจมตี (โจมตี +1)', effect: { atk: 1 } },
  ],
  verdan: [
    { key: 'blackBloodHealing', name: 'เลือดดำแห่งการเยียวยา', icon: '❤️', desc: 'เลือดพิเศษช่วยให้ฟื้นฟูร่างกายได้ดีกว่าปกติ (HP สูงสุด +5)', effect: { hp: 5 } },
    { key: 'telepathicBond',    name: 'สายใยจิตสัมผัส',      icon: '🧠', desc: 'การสื่อสารทางจิตช่วยจับจังหวะโจมตีแม่นยำ (โจมตี +1)', effect: { atk: 1 } },
  ],
  warforged: [
    { key: 'livingConstruct',      name: 'ร่างกลไกมีชีวิต', icon: '⚙️', desc: 'ร่างกายโลหะทนทานกว่ามนุษย์ปกติ (HP สูงสุด +6)', effect: { hp: 6 } },
    { key: 'integratedProtection', name: 'เกราะในตัว',      icon: '🛡️', desc: 'เกราะที่หลอมรวมกับร่างกายช่วยป้องกันการโจมตี (ป้องกัน +1)', effect: { ac: 1 } },
  ],
  yuanTi: [
    { key: 'serpentineSpells', name: 'เวทมนตร์งูพิษ', icon: '🐍', desc: 'เวทมนตร์จากสายเลือดงูช่วยเสริมพลังโจมตี (ดาเมจ +2)', effect: { dmg: 2 } },
    { key: 'poisonImmunity',   name: 'ต้านทานพิษ',    icon: '🛡️', desc: 'ร่างกายต้านทานพิษได้ดีกว่าปกติ (ป้องกัน +1)', effect: { ac: 1 } },
  ],
};
const DND_PASSIVE_EFFECT_KEYS = ['atk', 'dmg', 'ac', 'hp', 'critRange', 'gold'];

module.exports = { DND_RACE_PASSIVES, DND_PASSIVE_EFFECT_KEYS };
