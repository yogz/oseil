// The words of the Réglages (lot 6a). Titles and labels come from the interface spec (§7, planche 18);
// the rest is the builder's copy: tutoiement, ’, lowercase titles.

export const SETTINGS = 'Réglages'
export const SETTINGS_LINK = 'Réglages'
export const BACK_TO_MONEY = '‹ Mon argent'

export const GOALS_TITLE = 'Mes objectifs'
export const GOALS_NONE = 'Pas encore d’objectifs.'
export const SPENDING_TITLE = 'Mes dépenses par mois'
// A budget given as revenues is titled so (UI pass, 12 November 2026).
export const SALARY_TITLE = 'Mes revenus par mois'
export const SPENDING_NONE = 'Pas encore renseignées.'
export const SPENDING_EXPENSES = 'tes dépenses'
export const SPENDING_SALARY = 'tes revenus'
export const GOALS_HREF = '/premier-lancement/objectifs?depuis=reglages'
export const SPENDING_HREF = '/premier-lancement/depenses?depuis=reglages'

export const BANKS_TITLE = 'Mes banques'
export const BANKS_NONE = 'Aucune banque pour l’instant.'
export const BANK_ADD = '+ Ajouter une banque'
export const BANK_SEARCH = 'Chercher une banque…'
export const BANK_TYPED_LABEL = 'Le nom de ta banque'
export const BANK_TYPED_ADD = 'Ajouter'
export const BANK_ADD_MINE = '+ Ajouter la mienne'
export const BANK_ADD_HOME = 'Chez toi'
export const BANK_ADD_HOME_NOTE = 'un logement, de l’or ou de la crypto que tu gardes toi-même'
export const BANK_HOME_ALREADY = 'Chez toi est déjà dans ta liste.'
export const BANK_HOME_STILL_HOLDS = 'Chez toi a encore des comptes : ils doivent partir d’abord.'
export const BANK_CLOSE = 'Fermer'
export const BANK_UP = 'Monter'
export const BANK_DOWN = 'Descendre'
export const BANK_REMOVE = 'Retirer'
export const BANKS_ORDER_NOTE = 'L’ordre est celui de ta mise à jour.'
// The arrows are hidden at rest; this shows them, « Terminé » hides them (planche 2B, 12 November 2026).
export const BANKS_ORDER_CHANGE = 'Changer l’ordre'
export const BANKS_ORDER_DONE = 'Terminé'
export const bankAccounts = (count: number) => (count === 0 ? 'aucun compte' : count === 1 ? '1 compte' : `${count} comptes`)
export const BANK_ALREADY = 'Cette banque est déjà dans ta liste.'
export const BANK_STILL_HOLDS = 'Cette banque a encore des comptes\u00A0: ils doivent partir d’abord.'
export const BANK_NOT_POSSIBLE = 'Ce changement n’est plus possible. Recharge l’écran pour voir où tu en es.'

export const DISPLAY_TITLE = 'Affichage'
// The label of « En euros / En % », like « Apparence » and « Ta grille » (UX review, 12 November 2026).
export const DISPLAY_UNIT = 'Tes catégories'
export const DISPLAY_EUROS = 'En euros'
export const DISPLAY_PERCENT = 'En %'
export const HIDE_AMOUNTS = 'Masquer les montants'
export const HIDE_AMOUNTS_NOTE = 'Chaque montant devient « ••• ». La grille reste visible.'
export const APPEARANCE = 'Apparence'
export const APPEARANCE_SYSTEM = 'Comme l’appareil'
export const APPEARANCE_DARK = 'Sombre'
export const APPEARANCE_LIGHT = 'Clair'
export const SETTINGS_UNREADABLE = 'Tes réglages n’ont pas pu être lus\u00A0: ce choix ne peut pas être enregistré pour l’instant.'

// The reminder e-mail (spec of the reminder, « Dans les Réglages »). The title is the builder's word.
export const REMINDER_SECTION_TITLE = 'Le rappel de mise à jour'
export const REMINDER_EMAIL = 'Me le rappeler par e-mail'
export const REMINDER_EMAIL_NOTE = 'Quand tes chiffres n’ont pas été mis à jour depuis six mois.'
export const REMINDER_UNREADABLE = 'Ce réglage n’a pas pu être lu.'

export const ACCOUNT_TITLE = 'Mon compte'
export const EMAIL_LABEL = 'Adresse e-mail'
export const PRIVACY = 'Confidentialité'
export const PRIVACY_HREF = '/confidentialite'

export const PASSWORD_CHANGE = 'Changer de mot de passe'
export const PASSWORD_OLD = 'Mot de passe actuel'
export const PASSWORD_NEW = 'Nouveau mot de passe'
export const PASSWORD_NEW_AGAIN = 'Nouveau mot de passe, encore une fois'
export const PASSWORD_SUBMIT = 'Changer le mot de passe'
export const PASSWORD_DONE = 'Ton mot de passe a changé.'
export const PASSWORD_OLD_EMPTY = 'Tape ton mot de passe actuel.'
export const CANCEL = 'Annuler'
export const NOT_CURRENT_PASSWORD = 'Ce n’est pas ton mot de passe actuel.'
export const PASSWORD_HALF_CHANGED =
  'Ton coffre a pris le nouveau mot de passe, mais la connexion n’a pas suivi. Ne te déconnecte pas\u00A0: tape ton nouveau mot de passe dans les deux cases vides pour terminer.'
export const ACCOUNT_FAILED = 'Ça n’a pas marché. Vérifie ta connexion et réessaie.'

export const RECOVERY_REMAKE = 'Refaire ma clé de secours'
export const RECOVERY_REMAKE_NOTE = 'L’ancienne clé ne servira plus. Tape ton mot de passe pour en recevoir une nouvelle.'
export const RECOVERY_PASSWORD = 'Ton mot de passe'
export const RECOVERY_SUBMIT = 'Recevoir une nouvelle clé'
export const RECOVERY_CHANGED_MEANWHILE = 'Ta clé de secours a changé sur un autre appareil\u00A0: recommence.'
export const RECOVERY_DONE = 'Ta nouvelle clé de secours est en place.'

export const FACE_ID_TITLE = 'Mes clés Face ID'
export const FACE_ID_NONE = 'Aucune clé Face ID pour l’instant.'
export const FACE_ID_UNREADABLE = 'Tes clés Face ID n’ont pas pu être lues.'
export const FACE_ID_REMOVE = 'Retirer'
export const FACE_ID_HERE = 'cet appareil'
export const FACE_ID_REMOVE_FAILED = 'Cette clé n’a pas pu être retirée. Réessaie.'
export const faceIdAdded = (day: string) => `ajoutée le ${day}`

export const DATA_TITLE = 'Mes chiffres en fichier'
export const DATA_DOWNLOAD = 'Télécharger mes chiffres'
export const DATA_NOTE =
  'Tout ton historique dans un fichier Excel, à ouvrir dans Numbers ou à montrer à un conseiller. C’est aussi ta sauvegarde. Il est en clair : garde-le en lieu sûr.'
export const DATA_DRAFT = 'Ta mise à jour en cours n’y est pas, seulement les relevés terminés.'
// The profile is there but cannot be read: the file would name lines no tab describes, so it is not offered.
export const DATA_NO_PROFILE =
  'Tes banques et tes comptes n’ont pas pu être lus : le fichier ne peut pas être préparé pour l’instant.'
export const DATA_FAILED = 'Le fichier n’a pas pu être préparé. Réessaie.'
export const DATA_DONE = 'C’est dans tes Téléchargements (app Fichiers sur iPhone).'

// « Supprimer mon compte » (docs/superpowers/specs/2026-11-12-supprimer-mon-compte-design.md). The screen
// never promises more than is true: what Oseil keeps goes, not « nothing left anywhere ».
export const DELETE_LINK = 'Supprimer mon compte'
export const DELETE_HREF = '/reglages/supprimer'
export const DELETE_TITLE = 'Supprimer mon compte'
export const BACK_TO_SETTINGS = '‹ Réglages'
export const DELETE_WHAT_GOES =
  'Tes chiffres, ton historique, tes objectifs, tes clés Face ID, ton rappel par e-mail et ton adresse : tout ce qu’Oseil garde de toi est effacé, tout de suite.'
// Said in the colour of a loss, like the recovery key's warning (chosen by Nicolas on 12 November 2026).
export const DELETE_FOR_GOOD =
  'C’est définitif : personne, pas même nous, ne pourra rien récupérer.'
export const DELETE_DOWNLOAD_FIRST = 'Télécharge d’abord tes chiffres : c’est la seule trace qui te restera.'
export const DELETE_FACE_ID_NOTE =
  'Ta clé Face ID reste rangée dans l’app Mots de passe de ton appareil : tu peux l’y retirer toi-même.'
export const DELETE_PASSWORD = 'Ton mot de passe, pour confirmer'
export const DELETE_SUBMIT = 'Supprimer mon compte et mes chiffres'
export const deleteWithFaceId = (label: string) => `Confirmer avec ${label}`
// Only before the deletion is asked for (the confirmation failed): nothing can have been erased then.
export const DELETE_FAILED = 'La suppression n’a pas abouti. Rien n’a été effacé. Réessaie dans un moment.'
// Once it has been asked for and the answer is lost: neither outcome is known, so neither is said.
export const DELETE_UNKNOWN = 'On n’a pas pu savoir si la suppression a abouti. Réessaie dans un moment.'
// The signed-in address, read as the screen opens, could not be: the form cannot confirm anything.
export const DELETE_EMAIL_UNREADABLE = 'Ton adresse n’a pas pu être lue. Réessaie dans un moment.'
// Said on the landing, after the full load that follows the deletion.
export const ACCOUNT_DELETED = 'Ton compte a été supprimé.'
export const ACCOUNT_DELETED_PARAM = { name: 'compte', value: 'supprime' } as const
// Where a device goes once its account is known to be gone: the landing, which says so.
export const ACCOUNT_GONE_URL = `/?${ACCOUNT_DELETED_PARAM.name}=${ACCOUNT_DELETED_PARAM.value}`

export const LOAD_FAILED = 'Tes réglages n’ont pas pu être chargés.'
export const RETRY = 'Réessayer'

// « Ta grille » (docs/superpowers/specs/2026-11-12-grille-sans-chez-toi-design.md).
export const GRID_TITLE = 'Ta grille'
export const GRID_ALL = 'Tout compter'
export const GRID_WITHOUT_HOME = 'Sans chez toi'
export const GRID_NOTE = 'Ta maison, ta résidence secondaire et leurs crédits. Tes objectifs ne changent pas.'
export const GRID_ONLY_HOME = 'Rien d’autre à montrer pour l’instant.'
export const HOME_OUT_OF_GRID = 'Voir ma grille sans chez toi ›'
export const HOME_BACK_IN_GRID = 'Remettre chez toi dans ma grille ›'
export const WITHOUT_HOME_LABEL = 'À toi, hors chez toi'
export const HOME_OUT_HEADER = 'Chez toi est hors de ta grille, comme tu l’as choisi.'
export const OUT_OF_GRID_TITLE = 'Hors de ta grille'

