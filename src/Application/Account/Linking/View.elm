module Account.Linking.View exposing (..)

import Account.Creation.Context
import Account.Linking.Context exposing (..)
import Account.Linking.Exchange exposing (Exchange, Side(..), Step(..))
import Branding
import Common exposing (ifThenElse)
import FeatherIcons
import Html exposing (Html)
import Html.Attributes as A
import Html.Events as E
import Icons
import Page
import Radix exposing (Model, Msg(..))
import Styling as S
import Tailwind as T
import Url



-- 🖼


view : Context -> Model -> Html Msg
view context model =
    Html.div
        [ T.flex_1 ]
        [ Branding.logo { usedUsername = model.usedUsername }

        --
        , if context.waitingForDevices then
            let
                url =
                    Common.urlOrigin model.url
            in
            S.messageBlock
                [ T.italic ]
                [ Html.div
                    []
                    [ Html.text "Open this website on your other device to authenticate this one." ]

                --
                , S.clickToCopy url (CopyToClipboard url)
                , S.subtleFootNote
                    [ Html.text "Authenticating with "
                    , Html.span
                        [ T.border_b, T.border_gray_600 ]
                        [ Html.text context.username ]
                    ]
                ]

          else
            errorOrExchange (form context) context.exchange model
        ]


errorOrExchange : Html Msg -> Maybe Exchange -> Model -> Html Msg
errorOrExchange fallbackView maybeExchange model =
    case Maybe.andThen .error maybeExchange of
        Just err ->
            S.warning
                [ Html.em [] [ Html.text "Got an error during the exchange:" ]
                , Html.br [] []
                , Html.text err
                ]

        Nothing ->
            exchangeView fallbackView maybeExchange model



-- EXCHANGE


exchangeView : Html Msg -> Maybe Exchange -> Model -> Html Msg
exchangeView fallbackView maybeExchange model =
    case Maybe.map (\e -> Tuple.pair e.side e) maybeExchange of
        Just ( Inquirer _, exchange ) ->
            S.messageBlock
                [ T.italic ]
                [ Html.text "Do these numbers match the ones shown on your other device?"

                --
                , case exchange.nonceUser of
                    Just nonceUser ->
                        numberDisplay nonceUser

                    Nothing ->
                        Html.text ""
                ]

        Just ( Authoriser EstablishConnection, _ ) ->
            S.messageBlock
                [ T.italic ]
                [ Html.text "Negotiating with your other device." ]

        Just ( Authoriser ConstructUcan, exchange ) ->
            S.messageBlock
                []
                [ Html.span
                    [ T.italic ]
                    [ Html.text "Confirm these are the numbers shown on your other device." ]

                --
                , case exchange.nonceUser of
                    Just nonceUser ->
                        numberDisplay nonceUser

                    Nothing ->
                        Html.text ""

                --
                , Html.div
                    [ T.flex
                    , T.justify_center
                    , T.mt_10
                    ]
                    [ S.button
                        [ E.onClick (SendLinkingUcan exchange)

                        --
                        , T.bg_gray_200
                        , T.flex
                        , T.items_center

                        -- Dark mode
                        ------------
                        , T.dark__bg_purple_shade
                        ]
                        [ S.buttonIcon FeatherIcons.check
                        , Html.text "Approve"
                        ]

                    --
                    , S.button
                        [ E.onClick (CancelLink { onBothSides = True })

                        --
                        , T.bg_gray_400
                        , T.flex
                        , T.items_center
                        , T.ml_3

                        -- Dark mode
                        ------------
                        , T.dark__bg_gray_200
                        ]
                        [ S.buttonIcon FeatherIcons.x
                        , Html.text "Cancel"
                        ]
                    ]
                ]

        Nothing ->
            fallbackView



-- FORM


form : Context -> Html Msg
form context =
    Html.form
        [ E.onSubmit (LinkAccount context)

        --
        , T.max_w_sm
        , T.mt_8
        , T.mx_auto
        , T.w_full
        ]
        [ -- Username
          -----------
          S.label
            [ A.for "username"
            , T.mt_6
            ]
            [ Html.text "Username" ]
        , S.textField
            [ A.autocomplete False
            , A.id "username"
            , A.placeholder "thedoctor"
            , A.required True
            , A.value context.username
            , E.onInput GotLinkUsernameInput
            , T.w_full
            ]
            []

        -- Sign in
        ----------
        , S.button
            [ T.bg_gray_200
            , T.block
            , T.mt_6
            , T.w_full

            -- Dark mode
            ------------
            , T.dark__bg_purple_shade
            ]
            [ Html.text "Link account" ]

        --
        , case context.note of
            Just note ->
                S.formError
                    []
                    [ Icons.wrap
                        [ T.mr_1, T.pr_px ]
                        (FeatherIcons.withSize 15 FeatherIcons.alertTriangle)
                    , Html.span
                        [ T.italic ]
                        [ Html.text note ]
                    ]

            Nothing ->
                [ Html.text "Can I create an account instead?" ]
                    |> Html.span
                        [ Account.Creation.Context.default
                            |> Page.CreateAccount
                            |> GoToPage
                            |> E.onClick

                        --
                        , T.cursor_pointer
                        , T.underline
                        ]
                    |> List.singleton
                    |> Html.div [ T.text_center ]
                    |> List.singleton
                    |> S.subtleFootNote
        ]



-- NUMBER DISPLAY


numberDisplay : String -> Html Msg
numberDisplay number =
    number
        |> String.toList
        |> List.map
            (\n ->
                Html.div
                    [ T.border_2
                    , T.border_gray_600
                    , T.mr_2
                    , T.pt_px
                    , T.rounded_md
                    , T.w_12

                    --
                    , T.last__mr_0

                    -- Dark mode
                    ------------
                    , T.dark__border_darkness_above

                    -- Responsive
                    -------------
                    , T.sm__w_16
                    ]
                    [ Html.text (String.fromChar n)
                    ]
            )
        |> Html.div
            [ T.flex
            , T.font_display
            , T.font_thin
            , T.justify_center
            , T.leading_normal
            , T.mt_8
            , T.mx_auto
            , T.number_display
            , T.pt_1
            , T.not_italic
            , T.text_4xl
            , T.text_gray_200

            -- Dark mode
            ------------
            , T.dark__text_gray_400

            -- Responsive
            -------------
            , T.sm__text_5xl
            ]
