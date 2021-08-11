import Context from 'telegraf/typings/context'
import config  from '../../../config'
import i18n 	 from '../../i18n'
import Verror  from 'verror'

import { getMessageInline, sliceByHalf } from '../some_functions'

import {
  InlineQueryResultArticle,
} 										from 'typegram'
import { Document } 	from 'mongoose'
import { UserSchema } from '../../models/user.model'
import nHentai, { LightDoujin, SearchResult, SortingType } from '../../nhentai'
import {InlineQueryResult} from 'typegram/inline'

const nothingIsFoundResult: InlineQueryResultArticle = {
  id:                    String(6969696969),
  type:                  'article',
  title:                 i18n.__('nothing_is_found'),
  description:           '',
  thumb_url:             config.help_icon_inline,
  input_message_content: {
    message_text: i18n.__('help'),
    parse_mode:   'Markdown',
  },
  reply_markup: {
    inline_keyboard: [
      [
        {
          text:          i18n.__('search_tips_button'),
          callback_data: 'searchtips',
        },
      ],
      [{ text: i18n.__('settings_button'), callback_data: 'settings' }],
    ],
  },
}

export default async function replyWithSearchInline(
  ctx: Context,
  inlineQuery: string,
  specifiedPage: number | undefined,
  user: UserSchema & Document<any, any, UserSchema>
): Promise<void> {
  const searchType: 'photo' | 'article' = config.show_favorites_as_gallery ? 'photo' : 'article'
  
  const pageNumber = specifiedPage || 1
  inlineQuery = inlineQuery.replace(/\/p\d+/g, '').trim()

  let sortingParametr: SortingType = user.search_sorting === 'popular' ? 'popular' : ''
  const matchSorting = inlineQuery.match(/\/s[pn]/)
  let isSearchModified = false

  if (matchSorting) { // for example "@bot /sp smth"
    isSearchModified = true // need this to add tips based on user's query

    switch (matchSorting[0].slice(2).trim()) {
    case 'p': 
      sortingParametr = 'popular'
      break
    case 'pt':
      sortingParametr = 'popular-today'
      break
    case 'pw':
      sortingParametr = 'popular-week'
      break
    case 'n':
      break   
    case 'd':
      break
    default:
      console.error('Not allowed sorting \'' + matchSorting[0].slice(2).trim() + '\'')
    }
    inlineQuery = inlineQuery.replace(matchSorting[0], '').trim()
  }

  let searchResult: SearchResult
  try {
    searchResult = await nHentai.search(inlineQuery, pageNumber, sortingParametr)
  } catch (error) {
    throw new Verror(error, 'Searching inline')
  }
  if (searchResult.totalSearchResults === 0){
    const results: InlineQueryResultArticle[] = []
    results.push(nothingIsFoundResult)
    try {
      await ctx.answerInlineQuery(results).catch((err) => console.log(err))
    } catch (error) {
      throw new Verror(error, 'Answer Inline Nothing is found')
    }
    return
  }

  if (searchType === 'photo') {
    const results: InlineQueryResult[] = await getResultsUniversal(user, searchResult.results, inlineQuery, isSearchModified, sortingParametr, pageNumber)
    results.forEach((result)=>{
      result.type = 'photo'
    })
    try {
      await ctx.answerInlineQuery(results)
    } catch (error){
      throw new Verror(error, 'Answer Inline Favorites Photo')
    }
  } else {
    const results: InlineQueryResult[] = await getResultsUniversal(user, searchResult.results, inlineQuery, isSearchModified, sortingParametr, pageNumber)
    results.forEach((result)=>{
      result.type = 'article'
    })
    try {
      await ctx.answerInlineQuery(results)
    } catch (error){
      throw new Verror(error, 'Answer Inline Favorites Article')
    }
  }
}

async function getResultsUniversal(
  user: UserSchema & Document<any, any, UserSchema>,
  doujins: LightDoujin[],
  inlineQuery: string,
  isSearchModified: boolean,
  sortingParameter: SortingType,
  pageNumber: number
): Promise<InlineQueryResult[]> {
  const results: InlineQueryResult[] = []
  for (const doujin of doujins) {
    const message_text = getMessageInline(doujin)
    const description = doujin.language || sliceByHalf(String(doujin.title))
    results.push({
      id:    String(doujin.id),
      type:  'photo',
      title: String(doujin.title)
        .replace('<', '\\<')
        .replace('>', '\\>')
        .trim(),
      description: description
        .replace('<', '\\<')
        .replace('>', '\\>')
        .trim(),
      thumb_url:             String(doujin.thumbnail),
      photo_url:             String(doujin.thumbnail),
      input_message_content: {
        message_text: message_text,
        parse_mode:   'HTML',
      },
      reply_markup: {
        inline_keyboard: [
          [
            {
              text:          'Open',
              callback_data: 'open_' + doujin.id,
            },
          ],
        ],
      }
    })
  }
  // Tips and buttons to help user with search:

  const reverseSortingWord =
      sortingParameter.includes('popular') ? 'new' : 'popularity',
    reverseSortingPhotoUrl =
      sortingParameter.includes('popular')
        ? config.sort_by_new_icon_inline
        : config.sort_by_popular_icon_inline,
    sorting_tip_title = sortingParameter == 'popular' ? i18n.__('sorting_by_new_tip_title') : i18n.__('sorting_by_popularity_tip_title'),
    reverseSortingParametr = reverseSortingWord.charAt(0),
    searchSortingSwitch = pageNumber > 1
      ? `/p${pageNumber} /s${reverseSortingParametr} ${inlineQuery}`
      : `/s${reverseSortingParametr} ${inlineQuery}`

  results.unshift({
    id:                    String(69696969420),
    type:                  'photo',
    title:                 sorting_tip_title,
    description:           `Just add "/s${reverseSortingParametr}" to search qerry: (@nhentai_mangabot ${searchSortingSwitch})`,
    photo_url:             reverseSortingPhotoUrl,
    thumb_url:             reverseSortingPhotoUrl,
    input_message_content: {
      message_text:
          'To sort search results by ' +
          reverseSortingWord +
          ' you can *add /s' +
          reverseSortingParametr +
          '*',
      parse_mode: 'HTML',
    },
    reply_markup: {
      inline_keyboard: [
        [
          {
            text:                             'Sort by ' + reverseSortingWord,
            switch_inline_query_current_chat: searchSortingSwitch,
          },
        ],
      ],
    },
  })
  const sortingParameterLetter = sortingParameter == 'popular' ? 'p' : 'n',
    nextPageSwitch = isSearchModified
      ? `/p${+pageNumber + 1} /s${sortingParameterLetter} ${inlineQuery}`
      : `/p${+pageNumber + 1} ${inlineQuery}`
  results.push({
    id:          String(9696969696),
    type:        'photo',
    title:       i18n.__('next_page_tip_title'),
    description: `TAP HERE or Just add "/p${+pageNumber + 1
    }" to search qerry: (@nhentai_mangabot ${nextPageSwitch})`,
    photo_url:             config.next_page_icon_inline,
    thumb_url:             config.next_page_icon_inline,
    input_message_content: {
      message_text: i18n.__('next_page_tip_message'),
      parse_mode:   'HTML',
    },
    reply_markup: {
      inline_keyboard: [
        [
          {
            text:                             i18n.__('next_page_button'),
            switch_inline_query_current_chat: nextPageSwitch,
          },
        ],
      ],
    },
  })
  return results
}