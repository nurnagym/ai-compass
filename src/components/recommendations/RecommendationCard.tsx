import { useState } from 'react'
import { ArrowUpRight, Check, ThumbsUp, ThumbsDown, CircleCheck } from 'lucide-react'
import { toolById } from '../../data/catalog'
import { assets } from '../../data/assets'
import { Button } from '../ui/button'
import type { Recommendation } from '../../types/session'
import { externalToolSchema } from '../../lib/externalTool'
export function RecommendationCard({
  recommendation,
  index = 0,
}: {
  recommendation: Recommendation
  index?: number
}) {
  const [feedback, setFeedback] = useState('')
  const external = externalToolSchema.safeParse(recommendation.tool)
  const metadata =
    external.success && external.data.id === recommendation.toolId ? external.data : null
  const tool = recommendation.tool
    ? metadata && {
        name: metadata.name,
        officialUrl: metadata.officialUrl,
        shortDescription: metadata.description,
        category: recommendation.lifeArea === 'creativity' ? 'design' : 'everyday',
        knownLimitations: metadata.limitations,
        lastVerifiedDate: metadata.checkedAt.slice(0, 10),
        verificationSource: metadata.sourceUrl,
      }
    : toolById(recommendation.toolId)
  if (!tool) return null
  const Icon =
    assets[
      tool.category === 'design'
        ? 'creativity'
        : tool.category === 'research'
          ? 'research'
          : tool.category === 'audio'
            ? 'audio'
            : tool.category === 'video'
              ? 'video'
              : tool.category === 'coding'
                ? 'coding'
                : 'everyday'
    ]
  return (
    <article className="recommendation-card">
      <div className="recommendation-top">
        <span className="recommendation-number">ОТКРЫТИЕ {String(index + 1).padStart(2, '0')}</span>
        <span className={`fit-label ${recommendation.exploratory ? 'exploratory' : ''}`}>
          {recommendation.exploratory ? 'Идея для пробы' : 'По вашим ответам'}
        </span>
      </div>
      <div className="tool-heading">
        <span className="tool-icon">
          <Icon size={27} />
        </span>
        <div>
          <h2>{tool.name}</h2>
          <p>{tool.shortDescription}</p>
        </div>
      </div>
      <h3>{recommendation.opportunity}</h3>
      <p className="recommendation-why">{recommendation.why}</p>
      <div className="first-action">
        <span>ПОПРОБУЙТЕ ДЛЯ НАЧАЛА</span>
        {recommendation.workflow ? (
          <ol>
            {recommendation.workflow.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        ) : (
          <p>{recommendation.firstAction}</p>
        )}
      </div>
      <details>
        <summary>Что учесть</summary>
        <ul>
          {tool.knownLimitations.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
        <p>
          {metadata
            ? `${metadata.source === 'sheet' ? 'Из базы инструментов. Данные загружены' : 'Найден в интернете. Источник получен'} ${tool.lastVerifiedDate}. Условия могут меняться.`
            : `Описание проверено ${tool.lastVerifiedDate} по официальному источнику. Условия могут меняться.`}
        </p>
        <a href={tool.verificationSource} target="_blank" rel="noopener noreferrer">
          Источник описания <ArrowUpRight size={12} />
        </a>
        {metadata?.websiteSourceUrl && (
          <p>
            <a href={metadata.websiteSourceUrl} target="_blank" rel="noopener noreferrer">
              Официальный сайт подтверждён поиском <ArrowUpRight size={12} />
            </a>
          </p>
        )}
        {metadata?.contextSources.map((source) => (
          <p key={`${source.url}:${source.row}`}>
            <a
              href={`${source.url}${source.url.includes('#') ? '&' : '#'}range=A${source.row}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Юзкейс или решение · строка {source.row} <ArrowUpRight size={12} />
            </a>
          </p>
        ))}
      </details>
      <Button asChild className="try-tool">
        <a href={tool.officialUrl} target="_blank" rel="noopener noreferrer">
          Попробовать инструмент
          <ArrowUpRight size={17} />
        </a>
      </Button>
      <div className="feedback" role="group" aria-label={`Оценить ${tool.name}`}>
        {[
          { label: 'Полезно', Icon: ThumbsUp },
          { label: 'Не для меня', Icon: ThumbsDown },
          { label: 'Уже использую', Icon: CircleCheck },
        ].map(({ label, Icon: FeedbackIcon }) => (
          <button key={label} aria-pressed={feedback === label} onClick={() => setFeedback(label)}>
            {feedback === label ? <Check size={14} /> : <FeedbackIcon size={14} />} {label}
          </button>
        ))}
      </div>
      {feedback && (
        <p className="feedback-note" role="status">
          Отметка сохранена только в этой вкладке.
        </p>
      )}
    </article>
  )
}
